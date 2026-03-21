import { createHash } from "node:crypto";
import type { ToolResult } from "@/types/ai";
import type { ToolExecutionContext } from "@/lib/server/ai/tools/base";
import { logServerError } from "@/lib/server/logging";

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
  /**
   * Internal per-request cache key set by idempotency middleware.
   */
  idempotencyCacheKey?: string;
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
  "update_study",
  "store_memory",
]);

const DEFAULT_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_MAX_ENTRIES = 1024;

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
    // Scope deduplication to the current run to prevent masking
    // intentional repeated actions across separate user turns.
    runId: request.context?.runId ?? null,
  };
  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

function replayResult(cached: ToolResult, callId: string): ToolResult {
  return {
    ...cached,
    callId,
  };
}

export function createIdempotencyMiddleware(config?: {
  toolNames?: string[];
  ttlMs?: number;
  maxEntries?: number;
}): ToolMiddleware {
  const protectedTools = new Set(config?.toolNames ?? Array.from(DEFAULT_IDEMPOTENT_MUTATION_TOOLS));
  const ttlMs = Math.max(1_000, config?.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS);
  const maxEntries = Math.max(32, config?.maxEntries ?? DEFAULT_IDEMPOTENCY_MAX_ENTRIES);
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
    before: (request) => {
      if (!protectedTools.has(request.name)) return request;
      const now = Date.now();
      pruneExpired(now);
      const key = requestFingerprint(request);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now) {
        return {
          ...request,
          idempotencyCacheKey: key,
          shortCircuitResult: replayResult(cached.result, request.callId),
        };
      }
      return { ...request, idempotencyCacheKey: key };
    },
    after: (request, result) => {
      if (!protectedTools.has(request.name)) return;
      if (!request.idempotencyCacheKey) return;
      if (result.error) return;

      const now = Date.now();
      pruneExpired(now);
      cache.set(request.idempotencyCacheKey, {
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
          return replayResult(resolvedRequest.shortCircuitResult, resolvedRequest.callId);
        }
      }
    } catch (error) {
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
