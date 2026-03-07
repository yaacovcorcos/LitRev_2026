import type { AIErrorEnvelope } from "@/types/ai";
import { extractAIErrorEnvelope } from "@/lib/ai/error-envelope";
import { parseRetryAfterHeaderMs } from "@/lib/server/utils/retry";
import { normalizeHeaderRecord } from "@/lib/server/utils/header-record";

export type AIErrorReason =
    | "rate_limit"
    | "auth"
    | "billing"
    | "timeout"
    | "context_overflow"
    | "format"
    | "model_not_found"
    | "unknown";

export type ClassifiedAIError = {
    reason: AIErrorReason;
    message: string;
    status?: number;
    code?: string;
    retryAfterMs?: number;
    retryable: boolean;
};

type ErrorLike = {
    message?: unknown;
    error?: unknown;
    status?: unknown;
    statusCode?: unknown;
    errorStatus?: unknown;
    code?: unknown;
    errorCode?: unknown;
    headers?: unknown;
    errorHeaders?: unknown;
    responseHeaders?: unknown;
};

const OVERFLOW_PATTERNS = [
    /prompt is too long/i,
    /input is too long for requested model/i,
    /exceeds the context window/i,
    /input token count.*exceeds the maximum/i,
    /maximum prompt length is \d+/i,
    /reduce the length of the messages/i,
    /maximum context length is \d+ tokens/i,
    /exceeds the limit of \d+/i,
    /exceeds the available context size/i,
    /greater than the context length/i,
    /context window exceeds limit/i,
    /exceeded model token limit/i,
    /context[_ ]length[_ ]exceeded/i,
    /request.?too.?large/i,
    /token.*limit.*exceed/i,
    /input.*too.*long/i,
    // Observed in OpenCode provider adapters for Cerebras/Mistral style 400/413 empty-body failures.
    /^4(00|13)\s*(status code)?\s*\(no body\)/i,
    /请求.*超出.*上下文/i,
];

function extractMessage(error: unknown): string {
    if (typeof error === "string") return error;
    if (!error || typeof error !== "object") return "";
    const maybe = error as ErrorLike;
    if (typeof maybe.message === "string") return maybe.message;
    if (typeof maybe.error === "string") return maybe.error;
    if (maybe.error && typeof maybe.error === "object") {
        const nestedError = maybe.error as { message?: unknown; error?: unknown };
        if (typeof nestedError.message === "string") return nestedError.message;
        if (typeof nestedError.error === "string") return nestedError.error;
    }
    return "";
}

function toStatus(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
    return undefined;
}

function extractStatus(error: unknown): number | undefined {
    const envelope = extractAIErrorEnvelope(error);
    if (envelope?.status !== undefined) return envelope.status;
    if (!error || typeof error !== "object") return undefined;
    const maybe = error as ErrorLike;
    return toStatus(maybe.errorStatus) ?? toStatus(maybe.statusCode) ?? toStatus(maybe.status);
}

function extractCode(error: unknown): string | undefined {
    const envelope = extractAIErrorEnvelope(error);
    if (typeof envelope?.code === "string" && envelope.code.trim()) return envelope.code;
    if (!error || typeof error !== "object") return undefined;
    const maybe = error as ErrorLike;
    const code = maybe.errorCode ?? maybe.code;
    if (typeof code !== "string") return undefined;
    const trimmed = code.trim();
    return trimmed || undefined;
}

function extractHeaders(error: unknown): Record<string, string> | undefined {
    const envelope = extractAIErrorEnvelope(error);
    if (envelope?.headers) return envelope.headers;
    if (!error || typeof error !== "object") return undefined;
    const maybe = error as ErrorLike;
    return normalizeHeaderRecord(maybe.errorHeaders)
        ?? normalizeHeaderRecord(maybe.responseHeaders)
        ?? normalizeHeaderRecord(maybe.headers);
}

function reasonFromEnvelope(envelope: AIErrorEnvelope, status?: number): AIErrorReason {
    if (envelope.kind === "tool_call_parse" || envelope.kind === "tool_schema_validation") {
        return "format";
    }
    const lowerCode = envelope.code.toLowerCase();
    if (lowerCode === "context_length_exceeded") return "context_overflow";
    if (lowerCode === "insufficient_quota") return "billing";
    if (lowerCode === "model_not_found") return "model_not_found";
    if (lowerCode === "invalid_api_key") return "auth";
    if (isContextOverflowMessage(envelope.message)) return "context_overflow";
    if (status === 401 || status === 403) return "auth";
    if (status === 402) return "billing";
    if (status === 404) return "model_not_found";
    if (status === 429) return "rate_limit";
    if (status === 408 || (status !== undefined && status >= 500)) return "timeout";
    if (/rate.?limit|quota|too many requests|tpm|rpm|capacity|overloaded|529/i.test(envelope.message)) {
        return "rate_limit";
    }
    if (/timed?\s*out|deadline exceeded|context deadline exceeded|econnreset|etimedout|gateway timeout/i.test(envelope.message)) {
        return "timeout";
    }
    if (/insufficient.*credit|billing|payment|required|plan.*exceeded/i.test(envelope.message)) {
        return "billing";
    }
    if (/invalid.*key|unauthorized|forbidden|authentication/i.test(envelope.message)) {
        return "auth";
    }
    if (/tool[_ ]?use.*id|invalid.*request|malformed|invalid prompt|bad request/i.test(envelope.message)) {
        return "format";
    }
    if (/model.*not.*found|does not exist|unknown model/i.test(envelope.message)) {
        return "model_not_found";
    }
    return envelope.retryable ? "timeout" : "unknown";
}

export function isContextOverflowMessage(message: string): boolean {
    return OVERFLOW_PATTERNS.some((pattern) => pattern.test(message));
}

export function isRetryableReason(reason: AIErrorReason): boolean {
    return reason === "rate_limit" || reason === "timeout";
}

export function classifyAIError(error: unknown): ClassifiedAIError {
    const envelope = extractAIErrorEnvelope(error);
    if (envelope) {
        const status = envelope.status ?? extractStatus(error);
        const headers = envelope.headers ?? extractHeaders(error);
        return {
            reason: reasonFromEnvelope(envelope, status),
            message: envelope.message,
            status,
            code: envelope.code,
            retryAfterMs: parseRetryAfterHeaderMs(headers),
            retryable: envelope.retryable,
        };
    }

    const message = extractMessage(error);
    const status = extractStatus(error);
    const code = extractCode(error);
    const headers = extractHeaders(error);
    const retryAfterMs = parseRetryAfterHeaderMs(headers);

    const lowerCode = code?.toLowerCase();
    const reason: AIErrorReason = (() => {
        if (status === 401 || status === 403) return "auth";
        if (status === 402) return "billing";
        if (status === 404) return "model_not_found";
        if (status === 429) return "rate_limit";
        if (status === 408 || (status !== undefined && status >= 500)) return "timeout";

        if (lowerCode === "context_length_exceeded") return "context_overflow";
        if (lowerCode === "insufficient_quota") return "billing";
        if (lowerCode === "model_not_found") return "model_not_found";
        if (lowerCode === "invalid_api_key") return "auth";

        if (isContextOverflowMessage(message)) return "context_overflow";

        if (/rate.?limit|quota|too many requests|tpm|rpm|capacity|overloaded|529/i.test(message)) {
            return "rate_limit";
        }
        if (/timed?\s*out|deadline exceeded|context deadline exceeded|econnreset|etimedout|gateway timeout/i.test(message)) {
            return "timeout";
        }
        if (/insufficient.*credit|billing|payment|required|plan.*exceeded/i.test(message)) {
            return "billing";
        }
        if (/invalid.*key|unauthorized|forbidden|authentication/i.test(message)) {
            return "auth";
        }
        if (/tool[_ ]?use.*id|invalid.*request|malformed|invalid prompt|bad request/i.test(message)) {
            return "format";
        }
        if (/model.*not.*found|does not exist|unknown model/i.test(message)) {
            return "model_not_found";
        }
        return "unknown";
    })();

    return {
        reason,
        message,
        status,
        code,
        retryAfterMs,
        retryable: isRetryableReason(reason),
    };
}

export function toAIErrorEnvelope(
    error: unknown,
    overrides?: Partial<Pick<AIErrorEnvelope, "kind" | "code" | "retryable" | "source" | "message">>,
): AIErrorEnvelope {
    const existing = extractAIErrorEnvelope(error);
    if (existing) {
        return {
            ...existing,
            kind: overrides?.kind ?? existing.kind,
            code: overrides?.code ?? existing.code,
            retryable: overrides?.retryable ?? existing.retryable,
            source: overrides?.source ?? existing.source,
            message: overrides?.message ?? existing.message,
        };
    }

    const classified = classifyAIError(error);
    const headers = extractHeaders(error);

    return {
        kind: overrides?.kind ?? "provider_request",
        code: overrides?.code ?? classified.code ?? "PROVIDER_REQUEST_FAILED",
        retryable: overrides?.retryable ?? classified.retryable,
        source: overrides?.source ?? "provider_request",
        message: overrides?.message ?? classified.message ?? "The request failed.",
        status: classified.status,
        headers,
    };
}
