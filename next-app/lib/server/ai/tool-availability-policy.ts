import type { AIErrorEnvelope, ToolResult } from "@/types/ai";
import {
  getSearchSourceLabel,
  isPolicyGatedSearchToolName,
} from "@/lib/agent/search-source-policy";
import type { ToolExecutionRequest, ToolMiddleware } from "./tool-middleware";

function createToolUnavailableEnvelope(toolName: string): AIErrorEnvelope {
  const label = getSearchSourceLabel(toolName);
  const message = isPolicyGatedSearchToolName(toolName)
    ? `Tool "${toolName}" is not available for this request because the user did not explicitly ask for ${label}. Use search_pubmed unless the user asks for ${label} by name.`
    : `Tool "${toolName}" is not available for this request.`;

  return {
    kind: "request_policy",
    code: "TOOL_NOT_AVAILABLE_IN_REQUEST",
    retryable: false,
    source: "request_policy",
    message,
  };
}

export function createToolUnavailableInRequestResult(params: {
  callId: string;
  toolName: string;
}): ToolResult {
  const errorMeta = createToolUnavailableEnvelope(params.toolName);
  return {
    callId: params.callId,
    result: null,
    error: errorMeta.message,
    errorMeta,
  };
}

export function createToolAvailabilityPolicyMiddleware(): ToolMiddleware {
  return {
    name: "tool-availability-policy",
    before: (request: ToolExecutionRequest) => {
      const allowedToolNames = request.context?.allowedToolNames;
      if (!allowedToolNames || allowedToolNames.length === 0) return request;
      if (allowedToolNames.includes(request.name)) return request;

      return {
        ...request,
        shortCircuitReason: "policy_blocked",
        shortCircuitResult: createToolUnavailableInRequestResult({
          callId: request.callId,
          toolName: request.name,
        }),
      };
    },
  };
}
