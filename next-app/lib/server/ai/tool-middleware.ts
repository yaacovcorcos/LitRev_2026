import { createHash } from "node:crypto";
import type { ToolResult } from "@/types/ai";
import type { ToolExecutionContext } from "@/lib/server/ai/tools/base";
import { logServerError } from "@/lib/server/logging";
import { isAbortLikeError } from "@/lib/abort";
import {
  createPrismaToolIdempotencyStore,
  type ToolIdempotencyReservationInput,
  type ToolIdempotencyStore,
} from "./tool-idempotency-store";

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
  shortCircuitReason?: "idempotency_replay" | "idempotency_in_flight";
  /**
   * Internal per-request idempotency receipt set by idempotency middleware.
   */
  idempotencyReceipt?: {
    key: ToolIdempotencyReservationInput;
    reservationId?: string | null;
    persistent: boolean;
  };
};

export type ToolMiddleware = {
  name?: string;
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

const DEFAULT_IDEMPOTENT_MUTATION_TOOLS = new Set([
  "add_to_ledger",
  "bulk_screening",
  "create_project",
  "delete_study",
  "exclude_study",
  "forget_memory",
  "update_study",
  "update_study_direct",
  "update_protocol",
  "update_criteria",
  "update_note",
  "store_memory",
]);

const DEFAULT_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_MAX_ENTRIES = 1024;
const TOOL_IDEMPOTENCY_REPLAY = Symbol.for("litrev.ai.tool_idempotency_replay");

type IdempotencyCacheEntry = {
  result: ToolResult;
  createdAt: number;
  expiresAt: number;
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value) ?? '"__undefined__"';
}

function requestFingerprint(request: ToolExecutionRequest): string {
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

export function isIdempotencyReplayResult(result: ToolResult): boolean {
  return Boolean((result as ToolResult & { [TOOL_IDEMPOTENCY_REPLAY]?: true })[TOOL_IDEMPOTENCY_REPLAY]);
}

export function createIdempotencyMiddleware(config?: {
  toolNames?: string[];
  ttlMs?: number;
  maxEntries?: number;
  store?: ToolIdempotencyStore | null;
}): ToolMiddleware {
  const protectedTools = new Set(config?.toolNames ?? Array.from(DEFAULT_IDEMPOTENT_MUTATION_TOOLS));
  const ttlMs = Math.max(1_000, config?.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS);
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
    before: async (request) => {
      if (!protectedTools.has(request.name)) return request;
      const scopeKey = toolIdempotencyScopeKey(request);
      const fingerprint = requestFingerprint(request);

      if (store && scopeKey) {
        const receiptKey = buildReceiptKey(request, scopeKey, fingerprint);
        const reservation = await store.reserve(receiptKey);
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
          });
          return;
        }
        await store.complete({
          ...request.idempotencyReceipt.key,
          callId: request.callId,
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

export async function executeWithToolMiddleware(
  request: ToolExecutionRequest,
  middlewares: ToolMiddleware[],
  executor: ToolExecutor
): Promise<ToolResult> {
  let resolvedRequest = request;

  for (const middleware of middlewares) {
    if (!middleware.before) continue;
    try {
      const nextRequest = await middleware.before(resolvedRequest);
      if (nextRequest === null) {
        return blockedResult(resolvedRequest, middleware.name);
      }
      if (nextRequest) {
        resolvedRequest = nextRequest;
        if (resolvedRequest.shortCircuitResult) {
          return replayResult(
            resolvedRequest.shortCircuitResult,
            resolvedRequest.callId,
            resolvedRequest.shortCircuitReason === "idempotency_replay",
          );
        }
      }
    } catch (error) {
      if (resolvedRequest.context?.signal?.aborted || isAbortLikeError(error)) {
        throw error;
      }
      return {
        callId: resolvedRequest.callId,
        result: null,
        error: error instanceof Error
          ? `Tool middleware before hook failed: ${error.message}`
          : "Tool middleware before hook failed",
      };
    }
  }

  let result: ToolResult;
  try {
    result = await executor(resolvedRequest);
  } catch (error) {
    if (resolvedRequest.context?.signal?.aborted || isAbortLikeError(error)) {
      throw error;
    }
    return {
      callId: resolvedRequest.callId,
      result: null,
      error: error instanceof Error
        ? `Tool execution failed: ${error.message}`
        : "Tool execution failed",
    };
  }

  for (const middleware of middlewares) {
    if (!middleware.after) continue;
    try {
      const nextResult = await middleware.after(resolvedRequest, result);
      if (nextResult) {
        result = nextResult;
      }
    } catch (error) {
      logServerError("tool-middleware", "after hook failed", {
        middleware: middleware.name ?? "unnamed",
        toolName: resolvedRequest.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
