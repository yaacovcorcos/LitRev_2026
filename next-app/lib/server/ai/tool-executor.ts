import "server-only";

import type { AIErrorEnvelope, ToolResult } from "@/types/ai";
import {
  createAbortError,
  createDeadlineAbortController,
  isAbortLikeError,
  throwIfAborted,
} from "@/lib/abort";
import { parseRetryAfterHeaderMs, sleep } from "@/lib/server/utils/retry";
import type { ToolExecutionRequest, ToolExecutor } from "./tool-middleware";
import {
  getToolReliabilityPolicy,
  type ToolReliabilityPolicy,
} from "./tool-execution-policy";
import { createToolExecutionErrorEnvelope, ensureToolResultErrorMeta } from "./tool-errors";

export type ToolRetryEvent = {
  toolName: string;
  completedAttempt: number;
  nextAttempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMeta: AIErrorEnvelope;
};

export type ReliableToolExecutorOptions = {
  policy?: ToolReliabilityPolicy;
  random?: () => number;
  sleep?: typeof sleep;
  onRetry?: (event: ToolRetryEvent) => void;
};

function timeoutResult(request: ToolExecutionRequest, timeoutMs: number): ToolResult {
  const message = `Tool "${request.name}" exceeded its ${timeoutMs}ms execution deadline.`;
  return {
    callId: request.callId,
    result: null,
    error: message,
    errorMeta: createToolExecutionErrorEnvelope({
      toolName: request.name,
      error: { message, status: 408 },
      code: "TOOL_EXECUTION_TIMEOUT",
      source: "tool_executor",
      retryable: true,
      message,
    }),
  };
}

function thrownResult(request: ToolExecutionRequest, error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : `Tool "${request.name}" failed during execution.`;
  return {
    callId: request.callId,
    result: null,
    error: message,
    errorMeta: createToolExecutionErrorEnvelope({
      toolName: request.name,
      error,
      message,
    }),
  };
}

function withAttemptSignal(
  request: ToolExecutionRequest,
  signal: AbortSignal,
): ToolExecutionRequest {
  return {
    ...request,
    context: {
      ...request.context,
      signal,
    },
  };
}

function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => settle(() => reject(createAbortError()));

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

async function executeAttempt(
  request: ToolExecutionRequest,
  executor: ToolExecutor,
  timeoutMs: number | null,
): Promise<ToolResult> {
  throwIfAborted(request.context?.signal);
  if (timeoutMs === null) {
    try {
      return ensureToolResultErrorMeta(request.name, await executor(request));
    } catch (error) {
      if (request.context?.signal?.aborted || isAbortLikeError(error)) throw error;
      return thrownResult(request, error);
    }
  }

  const deadline = createDeadlineAbortController(timeoutMs, [request.context?.signal]);
  try {
    const result = await awaitWithAbort(
      executor(withAttemptSignal(request, deadline.signal)),
      deadline.signal,
    );
    return ensureToolResultErrorMeta(request.name, result);
  } catch (error) {
    if (request.context?.signal?.aborted) throw createAbortError();
    if (deadline.timedOut()) return timeoutResult(request, timeoutMs);
    if (isAbortLikeError(error)) throw error;
    return thrownResult(request, error);
  } finally {
    deadline.dispose();
  }
}

function retryDelayMs(
  result: ToolResult,
  completedAttempt: number,
  policy: ToolReliabilityPolicy,
  random: () => number,
): number | null {
  const retryAfterMs = parseRetryAfterHeaderMs(result.errorMeta?.headers);
  if (retryAfterMs !== undefined) {
    return retryAfterMs <= policy.maxDelayMs ? Math.max(retryAfterMs, policy.minDelayMs) : null;
  }
  const exponential = Math.min(
    policy.maxDelayMs,
    policy.minDelayMs * 2 ** (completedAttempt - 1),
  );
  const jitterOffset = (random() * 2 - 1) * policy.jitter;
  return Math.max(policy.minDelayMs, Math.round(exponential * (1 + jitterOffset)));
}

export async function executeToolReliably(
  request: ToolExecutionRequest,
  executor: ToolExecutor,
  options?: ReliableToolExecutorOptions,
): Promise<ToolResult> {
  const policy = options?.policy ?? getToolReliabilityPolicy(request.name);
  const random = options?.random ?? Math.random;
  const sleepImpl = options?.sleep ?? sleep;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const result = await executeAttempt(request, executor, policy.attemptTimeoutMs);
    if (!result.error || !result.errorMeta?.retryable || attempt >= policy.maxAttempts) {
      return result;
    }

    const delayMs = retryDelayMs(result, attempt, policy, random);
    if (delayMs === null) return result;
    options?.onRetry?.({
      toolName: request.name,
      completedAttempt: attempt,
      nextAttempt: attempt + 1,
      maxAttempts: policy.maxAttempts,
      delayMs,
      errorMeta: result.errorMeta,
    });
    await sleepImpl(delayMs, request.context?.signal);
  }

  return thrownResult(request, new Error(`Tool "${request.name}" exhausted its execution attempts.`));
}
