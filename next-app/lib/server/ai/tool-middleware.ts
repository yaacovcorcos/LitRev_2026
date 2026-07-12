import { createHash } from "node:crypto";
import type { ToolResult } from "@/types/ai";
import type { ToolExecutionContext } from "@/lib/server/ai/tools/base";
import { logServerError } from "@/lib/server/logging";
import { isAbortLikeError, throwIfAborted } from "@/lib/abort";
import { isRunOwnershipError } from "@/lib/server/agent/run";
import {
  createPrismaToolIdempotencyStore,
  type ToolIdempotencyReservationInput,
  type ToolIdempotencyStore,
} from "./tool-idempotency-store";
import { IDEMPOTENT_MUTATION_TOOL_NAMES } from "./tool-execution-policy";

export type ToolExecutionRequest = {
  name: string;
  args: Record<string, unknown>;
  callId: string;
  context?: ToolExecutionContext;
  /**
   * Internal middleware channel for deterministic replays.
   * When present, executeWithToolMiddleware returns this result without invoking executor.
   */
  shortCircuitResult?: ToolResult;
  shortCircuitReason?: "idempotency_replay" | "idempotency_in_flight" | "policy_blocked";
  /**
   * Internal per-request idempotency receipt set by idempotency middleware.
   */
  idempotencyReceipt?:
    | {
        key: ToolIdempotencyReservationInput;
        reservationId: string;
        persistent: true;
      }
    | {
        key: ToolIdempotencyReservationInput;
        persistent: false;
      };
  /** Canonical fingerprint computed once and shared by persistence boundaries. */
  executionFingerprint?: string;
};

export type ToolMiddleware = {
  name?: string;
  /** Persistence/safety hooks may require fail-closed settlement. */
  afterFailureMode?: "open" | "closed";
  before?: (
    request: ToolExecutionRequest
  ) => ToolExecutionRequest | null | void | Promise<ToolExecutionRequest | null | void>;
  after?: (
    request: ToolExecutionRequest,
    result: ToolResult
  ) => ToolResult | void | Promise<ToolResult | void>;
};

export type ToolExecutor = (request: ToolExecutionRequest) => Promise<ToolResult>;

function blockedResult(request: ToolExecutionRequest, middlewareName?: string): ToolResult {
  const label = middlewareName ? ` by middleware "${middlewareName}"` : " by middleware";
  return {
    callId: request.callId,
    result: null,
    error: `Tool execution blocked${label}.`,
  };
}

const DEFAULT_IDEMPOTENT_MUTATION_TOOLS = new Set<string>(IDEMPOTENT_MUTATION_TOOL_NAMES);

const DEFAULT_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_STALE_RUNNING_MS = 5 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_MAX_ENTRIES = 1024;
const TOOL_IDEMPOTENCY_REPLAY = Symbol.for("litrev.ai.tool_idempotency_replay");

type IdempotencyCacheEntry = {
  result: ToolResult;
  createdAt: number;
  expiresAt: number;
};

const MAX_FINGERPRINT_DEPTH = 20;
const MAX_FINGERPRINT_SERIALIZED_BYTES = 512 * 1024;

function stableSerialize(
  value: unknown,
  state = { depth: 0, bytes: 0, seen: new WeakSet<object>() },
): string {
  if (state.depth > MAX_FINGERPRINT_DEPTH) {
    throw new Error(`Tool arguments exceed the fingerprint depth limit (${MAX_FINGERPRINT_DEPTH}).`);
  }

  const append = (serialized: string): string => {
    state.bytes += Buffer.byteLength(serialized, "utf8");
    if (state.bytes > MAX_FINGERPRINT_SERIALIZED_BYTES) {
      throw new Error(`Tool arguments exceed the fingerprint size limit (${MAX_FINGERPRINT_SERIALIZED_BYTES} bytes).`);
    }
    return serialized;
  };

  if (!value || typeof value !== "object") {
    try {
      return append(JSON.stringify(value) ?? '"__undefined__"');
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Tool arguments exceed")) throw error;
      throw new Error("Tool arguments contain a value that cannot be fingerprinted.");
    }
  }
  if (state.seen.has(value)) {
    throw new Error("Tool arguments contain a circular reference and cannot be fingerprinted.");
  }
  state.seen.add(value);
  state.depth += 1;
  try {
    if (Array.isArray(value)) {
      const body = value.map((item) => stableSerialize(item, state)).join(",");
      return append(`[${body}]`);
    }
    const record = value as Record<string, unknown>;
    const body = Object.keys(record).sort()
      .map((key) => `${append(JSON.stringify(key))}:${stableSerialize(record[key], state)}`)
      .join(",");
    return append(`{${body}}`);
  } finally {
    state.depth -= 1;
    state.seen.delete(value);
  }
}

export function createToolExecutionFingerprint(request: ToolExecutionRequest): string {
  const payload = {
    name: request.name,
    args: request.args,
    userId: request.context?.userId ?? null,
    projectId: request.context?.projectId ?? null,
    studyId: request.context?.studyId ?? null,
  };
  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

function toolIdempotencyScopeKey(request: ToolExecutionRequest): string | null {
  return (
    request.context?.rootRunId
    ?? request.context?.parentRunId
    ?? request.context?.runId
    ?? null
  );
}

function buildReceiptKey(
  request: ToolExecutionRequest,
  scopeKey: string,
  fingerprint: string,
): ToolIdempotencyReservationInput {
  return {
    scopeKey,
    toolName: request.name,
    fingerprint,
    callId: request.callId,
    runId: request.context?.runId ?? null,
    projectId: request.context?.projectId ?? null,
    userId: request.context?.userId ?? null,
    studyId: request.context?.studyId ?? null,
  };
}

function inFlightResult(request: ToolExecutionRequest): ToolResult {
  return {
    callId: request.callId,
    result: null,
    error: `Tool "${request.name}" is already running for this run lineage. Continue from the recorded result instead of executing the same mutation twice.`,
  };
}

export function markIdempotencyReplayResult(result: ToolResult): ToolResult {
  Object.defineProperty(result, TOOL_IDEMPOTENCY_REPLAY, {
    value: true,
    enumerable: false,
  });
  return result;
}

function replayResult(cached: ToolResult, callId: string, markReplay = true): ToolResult {
  const result = {
    ...cached,
    callId,
  };
  if (markReplay) {
    markIdempotencyReplayResult(result);
  }
  return result;
}

function errorResultFromThrownError(
  request: ToolExecutionRequest,
  prefix: string,
  error: unknown,
): ToolResult {
  return {
    callId: request.callId,
    result: null,
    error: error instanceof Error
      ? `${prefix}: ${error.message}`
      : prefix,
  };
}

export function isIdempotencyReplayResult(result: ToolResult): boolean {
  return Boolean((result as ToolResult & { [TOOL_IDEMPOTENCY_REPLAY]?: true })[TOOL_IDEMPOTENCY_REPLAY]);
}

export function createIdempotencyMiddleware(config?: {
  toolNames?: string[];
  ttlMs?: number;
  staleRunningMs?: number;
  maxEntries?: number;
  store?: ToolIdempotencyStore | null;
}): ToolMiddleware {
  const protectedTools = new Set(config?.toolNames ?? Array.from(DEFAULT_IDEMPOTENT_MUTATION_TOOLS));
  const ttlMs = Math.max(1_000, config?.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS);
  const staleRunningMs = Math.max(
    1_000,
    config?.staleRunningMs ?? DEFAULT_IDEMPOTENCY_STALE_RUNNING_MS,
  );
  const maxEntries = Math.max(32, config?.maxEntries ?? DEFAULT_IDEMPOTENCY_MAX_ENTRIES);
  const store = config?.store === undefined ? createPrismaToolIdempotencyStore() : config.store;
  const cache = new Map<string, IdempotencyCacheEntry>();

  const pruneExpired = (now: number) => {
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }
  };

  const enforceCapacity = () => {
    if (cache.size <= maxEntries) return;
    const oldest = Array.from(cache.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, cache.size - maxEntries);
    for (const [key] of oldest) cache.delete(key);
  };

  return {
    name: "idempotency-envelope",
    afterFailureMode: "closed",
    before: async (request) => {
      if (!protectedTools.has(request.name)) return request;
      const scopeKey = toolIdempotencyScopeKey(request);
      const fingerprint = request.executionFingerprint ?? createToolExecutionFingerprint(request);
      request = { ...request, executionFingerprint: fingerprint };

      if (store && scopeKey) {
        const receiptKey = buildReceiptKey(request, scopeKey, fingerprint);
        const now = Date.now();
        const reservation = await store.reserve(receiptKey, {
          staleRunningBefore: new Date(now - staleRunningMs),
          now: new Date(now),
        });
        if (reservation.status === "replay") {
          return {
            ...request,
            shortCircuitReason: "idempotency_replay",
            shortCircuitResult: reservation.result,
          };
        }
        if (reservation.status === "in_flight") {
          return {
            ...request,
            shortCircuitReason: "idempotency_in_flight",
            shortCircuitResult: inFlightResult(request),
          };
        }
        return {
          ...request,
          idempotencyReceipt: {
            key: receiptKey,
            reservationId: reservation.reservationId,
            persistent: true,
          },
        };
      }

      const cacheScopeKey = scopeKey ?? "process-local";
      const receiptKey = buildReceiptKey(request, cacheScopeKey, fingerprint);
      const now = Date.now();
      pruneExpired(now);
      const key = `${cacheScopeKey}:${request.name}:${fingerprint}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now) {
        return {
          ...request,
          shortCircuitReason: "idempotency_replay",
          shortCircuitResult: cached.result,
        };
      }
      return {
        ...request,
        idempotencyReceipt: {
          key: receiptKey,
          persistent: false,
        },
      };
    },
    after: async (request, result) => {
      if (!protectedTools.has(request.name)) return;
      if (!request.idempotencyReceipt) return;

      if (request.idempotencyReceipt.persistent && store) {
        if (result.error) {
          await store.release({
            scopeKey: request.idempotencyReceipt.key.scopeKey,
            toolName: request.idempotencyReceipt.key.toolName,
            fingerprint: request.idempotencyReceipt.key.fingerprint,
            reservationId: request.idempotencyReceipt.reservationId,
            callId: request.idempotencyReceipt.key.callId,
          });
          return;
        }
        await store.complete({
          ...request.idempotencyReceipt.key,
          reservationId: request.idempotencyReceipt.reservationId,
          result,
        });
        return;
      }

      if (result.error) return;

      const now = Date.now();
      pruneExpired(now);
      const key = `${request.idempotencyReceipt.key.scopeKey}:${request.name}:${request.idempotencyReceipt.key.fingerprint}`;
      cache.set(key, {
        result: {
          ...result,
          // Replay result should always use the current callId.
          callId: "",
        },
        createdAt: now,
        expiresAt: now + ttlMs,
      });
      enforceCapacity();
    },
  };
}

async function runAfterHooks(
  request: ToolExecutionRequest,
  middlewares: ToolMiddleware[],
  initialResult: ToolResult
): Promise<ToolResult> {
  let result = initialResult;
  for (const middleware of middlewares) {
    if (!middleware.after) continue;
    try {
      const nextResult = await middleware.after(request, result);
      if (nextResult) {
        result = nextResult;
      }
    } catch (error) {
      logServerError("tool-middleware", "after hook failed", {
        middleware: middleware.name ?? "unnamed",
        toolName: request.name,
        error: error instanceof Error ? error.message : String(error),
      });
      if (middleware.afterFailureMode === "closed") {
        throw error;
      }
    }
  }
  return result;
}

export async function executeWithToolMiddleware(
  request: ToolExecutionRequest,
  middlewares: ToolMiddleware[],
  executor: ToolExecutor
): Promise<ToolResult> {
  let resolvedRequest = request;
  const appliedBeforeMiddlewares: ToolMiddleware[] = [];

  throwIfAborted(resolvedRequest.context?.signal);

  for (const middleware of middlewares) {
    if (!middleware.before) continue;
    try {
      const nextRequest = await middleware.before(resolvedRequest);
      if (nextRequest === null) {
        return runAfterHooks(
          resolvedRequest,
          appliedBeforeMiddlewares,
          blockedResult(resolvedRequest, middleware.name)
        );
      }
      if (nextRequest) {
        resolvedRequest = nextRequest;
        if (resolvedRequest.shortCircuitResult) {
          return runAfterHooks(
            resolvedRequest,
            appliedBeforeMiddlewares,
            replayResult(
              resolvedRequest.shortCircuitResult,
              resolvedRequest.callId,
              resolvedRequest.shortCircuitReason === "idempotency_replay",
            ),
          );
        }
      }
      appliedBeforeMiddlewares.push(middleware);
    } catch (error) {
      if (
        resolvedRequest.context?.signal?.aborted
        || isAbortLikeError(error)
        || isRunOwnershipError(error)
      ) {
        await runAfterHooks(
          resolvedRequest,
          appliedBeforeMiddlewares,
          errorResultFromThrownError(
            resolvedRequest,
            "Tool middleware before hook aborted",
            error,
          ),
        );
        throw error;
      }
      return runAfterHooks(
        resolvedRequest,
        appliedBeforeMiddlewares,
        errorResultFromThrownError(
          resolvedRequest,
          "Tool middleware before hook failed",
          error,
        ),
      );
    }
  }

  let result: ToolResult;
  try {
    throwIfAborted(resolvedRequest.context?.signal);
    result = await executor(resolvedRequest);
  } catch (error) {
    if (
      resolvedRequest.context?.signal?.aborted
      || isAbortLikeError(error)
      || isRunOwnershipError(error)
    ) {
      await runAfterHooks(
        resolvedRequest,
        appliedBeforeMiddlewares,
        errorResultFromThrownError(
          resolvedRequest,
          "Tool execution aborted",
          error,
        ),
      );
      throw error;
    }
    return runAfterHooks(
      resolvedRequest,
      appliedBeforeMiddlewares,
      errorResultFromThrownError(
        resolvedRequest,
        "Tool execution failed",
        error,
      ),
    );
  }

  return runAfterHooks(resolvedRequest, middlewares, result);
}
