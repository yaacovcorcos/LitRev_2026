import type { AIErrorEnvelope, AIErrorSource, ToolResult } from "@/types/ai";
import { extractAIErrorEnvelope } from "@/lib/ai/error-envelope";
import { classifyAIError, type AIErrorReason } from "@/lib/server/ai/error-classification";

const TOOL_ERROR_CODES: Record<AIErrorReason, string> = {
    rate_limit: "TOOL_UPSTREAM_RATE_LIMITED",
    usage_limit: "TOOL_UPSTREAM_USAGE_LIMIT_REACHED",
    auth: "TOOL_UPSTREAM_AUTH_FAILED",
    billing: "TOOL_UPSTREAM_BILLING_FAILED",
    timeout: "TOOL_UPSTREAM_TIMEOUT",
    context_overflow: "TOOL_CONTEXT_OVERFLOW",
    format: "TOOL_UPSTREAM_RESPONSE_INVALID",
    model_not_found: "TOOL_UPSTREAM_MODEL_NOT_FOUND",
    unknown: "TOOL_EXECUTION_FAILED",
};

function defaultSource(reason: AIErrorReason): Extract<AIErrorSource, "tool_executor" | "tool_upstream"> {
    return reason === "unknown" ? "tool_executor" : "tool_upstream";
}

function retryHeaders(retryAfterMs?: number): Record<string, string> | undefined {
    if (retryAfterMs === undefined || !Number.isFinite(retryAfterMs) || retryAfterMs < 0) {
        return undefined;
    }
    return { "retry-after-ms": String(Math.ceil(retryAfterMs)) };
}

export function createToolExecutionErrorEnvelope(params: {
    toolName: string;
    error: unknown;
    code?: string;
    source?: Extract<AIErrorSource, "tool_executor" | "tool_upstream" | "tool_middleware" | "tool_idempotency">;
    retryable?: boolean;
    message?: string;
}): AIErrorEnvelope {
    const existing = extractAIErrorEnvelope(params.error);
    if (existing) return existing;

    const classified = classifyAIError(params.error);
    const detail = params.message?.trim() || classified.message.trim();
    return {
        kind: "tool_execution",
        code: params.code ?? TOOL_ERROR_CODES[classified.reason],
        retryable: params.retryable ?? classified.retryable,
        source: params.source ?? defaultSource(classified.reason),
        message: detail || `${params.toolName} failed during execution.`,
        status: classified.status,
        headers: retryHeaders(classified.retryAfterMs),
    };
}

export function ensureToolResultErrorMeta(
    toolName: string,
    result: ToolResult,
    overrides?: Omit<Parameters<typeof createToolExecutionErrorEnvelope>[0], "toolName" | "error">,
): ToolResult {
    if (!result.error || result.errorMeta) return result;
    return {
        ...result,
        errorMeta: createToolExecutionErrorEnvelope({
            toolName,
            error: result.error,
            ...overrides,
        }),
    };
}
