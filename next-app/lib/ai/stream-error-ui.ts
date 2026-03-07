import { extractAIErrorEnvelope } from "@/lib/ai/error-envelope";

const CLAUDE_REASONING_BUDGET_PATTERN = /max_tokens.*greater than.*thinking\.budget_tokens/i;
const RATE_LIMIT_PATTERN = /rate.?limit|too many requests|overloaded|capacity/i;
const AUTH_PATTERN = /unauthorized|forbidden|invalid.*api key|authentication/i;
const CONTEXT_PATTERN = /context window|context length|too long|token limit|request.*too.*large|input.*too.*long/i;

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
