import type { ToolResult } from "@/types/ai";
import type { ToolExecutionContext } from "@/lib/server/ai/tools/base";

export type ToolExecutionRequest = {
  name: string;
  args: Record<string, unknown>;
  callId: string;
  context?: ToolExecutionContext;
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
      console.error("[tool-middleware] after hook failed", {
        middleware: middleware.name ?? "unnamed",
        toolName: resolvedRequest.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
