import { extractAIErrorEnvelope } from "@/lib/ai/error-envelope";
import type { AIErrorEnvelope } from "@/types/ai";
import type { StreamTerminalReason } from "@/lib/ai/stream-lifecycle";

const CLAUDE_REASONING_BUDGET_PATTERN = /max_tokens.*greater than.*thinking\.budget_tokens/i;
const RATE_LIMIT_PATTERN = /rate.?limit|too many requests|overloaded|capacity/i;
const AUTH_PATTERN = /unauthorized|forbidden|invalid.*api key|authentication/i;
const CONTEXT_PATTERN = /context window|context length|too long|token limit|request.*too.*large|input.*too.*long/i;
const NETWORK_PATTERN = /network|failed to fetch|econn|timeout|timed out|socket|offline/i;
const RETRY_HINT_PATTERN = /retry|temporarily busy|try again/i;

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function extractRawErrorMessage(error: unknown): string {
    const errorMeta = extractAIErrorEnvelope(error);
    if (errorMeta?.message) return errorMeta.message;
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object") {
        const maybe = error as { message?: unknown; error?: unknown };
        if (typeof maybe.message === "string") return maybe.message;
        if (typeof maybe.error === "string") return maybe.error;
    }
    return "";
}

function extractEmbeddedProviderMessage(rawMessage: string): string | null {
    const trimmed = rawMessage.trim();
    if (!trimmed) return null;

    const jsonCandidate = (() => {
        if (trimmed.startsWith("{")) return trimmed;
        const firstBrace = trimmed.indexOf("{");
        if (firstBrace <= 0) return null;
        const prefix = trimmed.slice(0, firstBrace).trim();
        return /^\d{3}$/.test(prefix) ? trimmed.slice(firstBrace) : null;
    })();

    if (!jsonCandidate) return null;

    try {
        const parsed = JSON.parse(jsonCandidate) as {
            message?: unknown;
            error?: { message?: unknown } | unknown;
        };
        if (typeof parsed.error === "object" && parsed.error !== null) {
            const nested = parsed.error as { message?: unknown };
            if (typeof nested.message === "string") return nested.message;
        }
        if (typeof parsed.message === "string") return parsed.message;
        return null;
    } catch {
        return null;
    }
}

/**
 * Convert provider/server error payloads into concise user-facing text.
 * This is intentionally UI-focused and strips transport noise like "400 {...json...}".
 */
export function formatStreamErrorForUI(error: unknown): string {
    const raw = collapseWhitespace(extractRawErrorMessage(error));
    const extracted = extractEmbeddedProviderMessage(raw);
    const base = collapseWhitespace(extracted ?? raw);

    if (!base) return "The request failed. Please try again.";
    if (CLAUDE_REASONING_BUDGET_PATTERN.test(base)) {
        return "Claude could not run this request with the current reasoning settings. Retry, or set reasoning to Off.";
    }
    if (RATE_LIMIT_PATTERN.test(base)) {
        return "The model is temporarily busy. Please retry in a moment.";
    }
    if (AUTH_PATTERN.test(base)) {
        return "The AI provider rejected authentication. Check provider configuration.";
    }
    if (CONTEXT_PATTERN.test(base)) {
        return "This request is too large for the selected model. Try a shorter prompt.";
    }

    return base.length > 240 ? `${base.slice(0, 237)}...` : base;
}

function inferRetryableFromMessage(message: string): boolean {
    const normalized = collapseWhitespace(message).toLowerCase();
    if (!normalized) return false;
    if (RATE_LIMIT_PATTERN.test(normalized)) return true;
    if (NETWORK_PATTERN.test(normalized)) return true;
    if (RETRY_HINT_PATTERN.test(normalized) && !AUTH_PATTERN.test(normalized) && !CONTEXT_PATTERN.test(normalized)) {
        return true;
    }
    return false;
}

export function buildClientErrorState(error: unknown): {
    message: string;
    retryable: boolean;
    errorMeta: AIErrorEnvelope;
} {
    const errorMeta = extractAIErrorEnvelope(error);
    const message = formatStreamErrorForUI(error);
    if (errorMeta) {
        return {
            message,
            retryable: errorMeta.retryable,
            errorMeta,
        };
    }
    const retryable = inferRetryableFromMessage(message);
    return {
        message,
        retryable,
        errorMeta: {
            kind: "runtime",
            code: "CLIENT_STREAM_ERROR",
            retryable,
            source: "runtime",
            message,
        },
    };
}

export function extractLegacyRecoveryError(text: string): { message: string; retryable: boolean } | null {
    const trimmed = text.trim();
    if (trimmed.startsWith(STREAM_ERROR_PREFIX)) {
        const retryable = /please try again\.?$/i.test(trimmed);
        return {
            message: trimmed
                .slice(STREAM_ERROR_PREFIX.length)
                .replace(/\.\s*Please try again\.?$/i, "")
                .trim(),
            retryable,
        };
    }
    if (trimmed.startsWith(PLAN_ERROR_PREFIX)) {
        return {
            message: trimmed.slice(PLAN_ERROR_PREFIX.length).trim(),
            retryable: false,
        };
    }
    return null;
}

const STREAM_ERROR_PREFIX = "Sorry, I encountered an error:";
const PLAN_ERROR_PREFIX = "Plan execution failed:";

export function shouldSuppressClientFallback(params: {
    errorMeta?: AIErrorEnvelope;
    hasAssistantContent: boolean;
    hasRenderedError?: boolean;
}): boolean {
    if (params.hasRenderedError) return true;
    return Boolean(params.errorMeta && !params.errorMeta.retryable && params.hasAssistantContent);
}

export function isSameRenderedError(params: {
    existingMessage?: string | null;
    existingMeta?: AIErrorEnvelope | null;
    nextMessage: string;
    nextMeta?: AIErrorEnvelope | null;
}): boolean {
    const existingMessage = collapseWhitespace(params.existingMessage ?? "");
    const nextMessage = collapseWhitespace(params.nextMessage);
    if (!existingMessage || existingMessage !== nextMessage) {
        return false;
    }

    const existingMeta = params.existingMeta ?? null;
    const nextMeta = params.nextMeta ?? null;

    if (existingMeta && nextMeta) {
        return existingMeta.code === nextMeta.code
            && existingMeta.source === nextMeta.source;
    }

    return true;
}

export function isRetryableTerminalReason(reason: StreamTerminalReason | null): boolean {
    return reason === "failed_network" || reason === "timed_out";
}
