import { extractAIErrorEnvelope } from "@/lib/ai/error-envelope";
import { buildFailureFallbackMessage } from "@/lib/ai/run-outcome";
import type { AIErrorEnvelope } from "@/types/ai";
import { isFailureTerminalReason, type StreamTerminalReason } from "@/lib/ai/stream-lifecycle";

const CLAUDE_REASONING_BUDGET_PATTERN = /max_tokens.*greater than.*thinking\.budget_tokens/i;
const DAILY_TOKEN_LIMIT_PATTERN = /daily token limit exceeded|maximum\s+\d+\s+tokens per day/i;
const RATE_LIMIT_PATTERN = /rate.?limit|too many requests|overloaded|capacity/i;
const AUTH_PATTERN = /unauthorized|forbidden|invalid.*api key|authentication/i;
const CONTEXT_PATTERN = /context window|context length|too long|request.*too.*large|input.*too.*long|exceeded model token limit|token.*limit.*exceed/i;
const NETWORK_PATTERN = /network|failed to fetch|econn|timeout|timed out|socket|offline/i;
const RETRY_HINT_PATTERN = /retry|temporarily busy|try again/i;

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function normalizedText(value: string): string {
    return collapseWhitespace(value).toLowerCase();
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

function isDatabaseConnectionError(errorMeta: AIErrorEnvelope | undefined, baseMessage: string): boolean {
    if (errorMeta?.kind === "database_connection" || errorMeta?.source === "database_connection") {
        return true;
    }
    if (errorMeta?.code === "DATABASE_CONNECTION_TIMEOUT" || errorMeta?.code === "DATABASE_CONNECTION_FAILED") {
        return true;
    }
    return /connection terminated due to connection timeout|can't reach database server|connection refused|econnrefused/i.test(baseMessage);
}

/**
 * Convert provider/server error payloads into concise user-facing text.
 * This is intentionally UI-focused and strips transport noise like "400 {...json...}".
 */
export function formatStreamErrorForUI(error: unknown): string {
    const base = getBaseErrorMessage(error);
    const errorMeta = extractAIErrorEnvelope(error);

    if (!base) return "The request failed. Please try again.";
    if (isDatabaseConnectionError(errorMeta, base)) {
        return errorMeta?.code === "DATABASE_CONNECTION_FAILED"
            ? "The app could not reach the database. Please retry."
            : "The app could not reach the database in time. Please retry.";
    }
    if (CLAUDE_REASONING_BUDGET_PATTERN.test(base)) {
        return "Claude could not run this request with the current reasoning settings. Retry, or set reasoning to Off.";
    }
    if (DAILY_TOKEN_LIMIT_PATTERN.test(base)) {
        return "Daily token limit reached for your workspace. Try again tomorrow.";
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

function getBaseErrorMessage(error: unknown): string {
    const raw = collapseWhitespace(extractRawErrorMessage(error));
    const extracted = extractEmbeddedProviderMessage(raw);
    return collapseWhitespace(extracted ?? raw);
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

type GenericMessageExtractor<T> = (item: T) => string | null | undefined;
type GenericMetaExtractor<T> = (item: T) => AIErrorEnvelope | null | undefined;
type GenericCheckpointMetaExtractor<T> = (
    item: T,
) => { runId?: string | null; checkpointKind?: "standard" | "recovery" | null; label?: string | null } | null | undefined;

export function hasRenderedErrorMatch<T>(params: {
    items: T[];
    nextMessage: string;
    nextMeta?: AIErrorEnvelope | null;
    getMessage: GenericMessageExtractor<T>;
    getErrorMeta: GenericMetaExtractor<T>;
}): boolean {
    return params.items.some((item) => isSameRenderedError({
        existingMessage: params.getMessage(item) ?? null,
        existingMeta: params.getErrorMeta(item) ?? null,
        nextMessage: params.nextMessage,
        nextMeta: params.nextMeta ?? null,
    }));
}

export function hasCanonicalFailureFallbackText<T>(params: {
    items: T[];
    streamError: unknown;
    getText: GenericMessageExtractor<T>;
}): boolean {
    return params.items.some((item) => {
        const text = params.getText(item);
        return typeof text === "string" && matchesCanonicalFailureFallback({
            assistantText: text,
            streamError: params.streamError,
        });
    });
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

export function getErrorRunId(errorMeta: AIErrorEnvelope | null | undefined): string | null {
    return errorMeta?.runId ?? errorMeta?.activeRunId ?? null;
}

function getSameRunErrorAuthority(errorMeta: AIErrorEnvelope | null | undefined): number {
    if (!errorMeta) return 0;

    if (
        errorMeta.kind === "run_conflict"
        || errorMeta.code === "RUN_RECOVERY_REQUIRES_USER_ACTION"
        || errorMeta.recoveryRecommendation === "stop_and_retry"
        || errorMeta.recoveryRecommendation === "continue_from_checkpoint"
        || errorMeta.recoveryRecommendation === "continue_from_durable_state"
        || errorMeta.recoveryRecommendation === "reconnect"
    ) {
        return 3;
    }

    if (errorMeta.code === "RUN_RECOVERY_TIMEOUT" || errorMeta.code === "RUN_RECOVERY_FAILED") {
        return 2;
    }

    return 1;
}

function getCheckpointRunId(
    checkpointMeta:
        | { runId?: string | null; checkpointKind?: "standard" | "recovery" | null; label?: string | null }
        | null
        | undefined,
): string | null {
    if (!checkpointMeta || checkpointMeta.checkpointKind !== "recovery") {
        return null;
    }
    return checkpointMeta.runId ?? null;
}

function getSameRunCheckpointAuthority(
    checkpointMeta:
        | { runId?: string | null; checkpointKind?: "standard" | "recovery" | null; label?: string | null }
        | null
        | undefined,
): number {
    return getCheckpointRunId(checkpointMeta) ? 0 : -1;
}

function isSameRunScopedRecoveryCheckpoint(params: {
    existingCheckpointMeta:
        | { runId?: string | null; checkpointKind?: "standard" | "recovery" | null; label?: string | null }
        | null
        | undefined;
    nextCheckpointMeta:
        | { runId?: string | null; checkpointKind?: "standard" | "recovery" | null; label?: string | null }
        | null
        | undefined;
}): boolean {
    const existingRunId = getCheckpointRunId(params.existingCheckpointMeta);
    const nextRunId = getCheckpointRunId(params.nextCheckpointMeta);
    if (!existingRunId || !nextRunId || existingRunId !== nextRunId) {
        return false;
    }

    const existingLabel = collapseWhitespace(params.existingCheckpointMeta?.label ?? "");
    const nextLabel = collapseWhitespace(params.nextCheckpointMeta?.label ?? "");
    return Boolean(existingLabel && existingLabel === nextLabel);
}

export function reconcileRunScopedRenderedErrors<T>(params: {
    items: T[];
    nextMessage: string;
    nextMeta?: AIErrorEnvelope | null;
    getMessage: GenericMessageExtractor<T>;
    getErrorMeta: GenericMetaExtractor<T>;
}): {
    items: T[];
    shouldAppend: boolean;
} {
    const nextMeta = params.nextMeta ?? null;
    const nextRunId = getErrorRunId(nextMeta);
    const nextAuthority = getSameRunErrorAuthority(nextMeta);
    let shouldAppend = true;

    const items = params.items.filter((item) => {
        const existingMeta = params.getErrorMeta(item) ?? null;
        if (!existingMeta) return true;

        if (isSameRenderedError({
            existingMessage: params.getMessage(item) ?? null,
            existingMeta,
            nextMessage: params.nextMessage,
            nextMeta,
        })) {
            shouldAppend = false;
            return true;
        }

        if (!nextRunId) return true;

        const existingRunId = getErrorRunId(existingMeta);
        if (!existingRunId || existingRunId !== nextRunId) return true;

        const existingAuthority = getSameRunErrorAuthority(existingMeta);
        if (existingAuthority > nextAuthority) {
            shouldAppend = false;
            return true;
        }

        return false;
    });

    return { items, shouldAppend };
}

export function reconcileRunScopedRecoveryState<T>(params: {
    items: T[];
    nextMessage?: string | null;
    nextMeta?: AIErrorEnvelope | null;
    nextCheckpoint?:
        | { runId?: string | null; checkpointKind?: "standard" | "recovery" | null; label?: string | null }
        | null;
    getMessage: GenericMessageExtractor<T>;
    getErrorMeta: GenericMetaExtractor<T>;
    getCheckpointMeta: GenericCheckpointMetaExtractor<T>;
}): {
    items: T[];
    shouldAppend: boolean;
} {
    const nextMeta = params.nextMeta ?? null;
    const nextCheckpoint = params.nextCheckpoint ?? null;
    const nextRunId = getErrorRunId(nextMeta) ?? getCheckpointRunId(nextCheckpoint);
    const nextAuthority = nextMeta
        ? getSameRunErrorAuthority(nextMeta)
        : getSameRunCheckpointAuthority(nextCheckpoint);
    let shouldAppend = true;

    const items = params.items.filter((item) => {
        const existingMeta = params.getErrorMeta(item) ?? null;
        const existingCheckpoint = params.getCheckpointMeta(item) ?? null;

        if (existingMeta) {
            if (
                params.nextMessage
                && isSameRenderedError({
                    existingMessage: params.getMessage(item) ?? null,
                    existingMeta,
                    nextMessage: params.nextMessage,
                    nextMeta,
                })
            ) {
                shouldAppend = false;
                return true;
            }

            if (!nextRunId) return true;

            const existingRunId = getErrorRunId(existingMeta);
            if (!existingRunId || existingRunId !== nextRunId) return true;

            const existingAuthority = getSameRunErrorAuthority(existingMeta);
            if (existingAuthority > nextAuthority) {
                shouldAppend = false;
                return true;
            }

            return false;
        }

        if (!existingCheckpoint) return true;

        if (isSameRunScopedRecoveryCheckpoint({
            existingCheckpointMeta: existingCheckpoint,
            nextCheckpointMeta: nextCheckpoint,
        })) {
            shouldAppend = false;
            return true;
        }

        if (!nextRunId) return true;

        const existingRunId = getCheckpointRunId(existingCheckpoint);
        if (!existingRunId || existingRunId !== nextRunId) return true;

        const existingAuthority = getSameRunCheckpointAuthority(existingCheckpoint);
        if (existingAuthority > nextAuthority) {
            shouldAppend = false;
            return true;
        }

        return false;
    });

    return { items, shouldAppend };
}

export function clearRunScopedRenderedErrors<T>(params: {
    items: T[];
    runId?: string | null;
    getErrorMeta: GenericMetaExtractor<T>;
}): T[] {
    if (!params.runId) return params.items;
    return params.items.filter((item) => getErrorRunId(params.getErrorMeta(item) ?? null) !== params.runId);
}

export function clearRunScopedRecoveryState<T>(params: {
    items: T[];
    runId?: string | null;
    getErrorMeta: GenericMetaExtractor<T>;
    getCheckpointMeta: GenericCheckpointMetaExtractor<T>;
}): T[] {
    if (!params.runId) return params.items;
    return params.items.filter((item) => {
        const errorRunId = getErrorRunId(params.getErrorMeta(item) ?? null);
        if (errorRunId === params.runId) {
            return false;
        }
        const checkpointRunId = getCheckpointRunId(params.getCheckpointMeta(item) ?? null);
        return checkpointRunId !== params.runId;
    });
}

export function isRetryableTerminalReason(reason: StreamTerminalReason | null): boolean {
    return reason === "failed_interrupted" || reason === "failed_network" || reason === "timed_out";
}

export function buildUnexpectedTerminalErrorState(reason: StreamTerminalReason): {
    message: string;
    retryable: boolean;
    errorMeta: AIErrorEnvelope;
} {
    if (!isFailureTerminalReason(reason)) {
        throw new Error(`Unexpected non-failure terminal reason: ${reason}`);
    }
    const message = reason === "timed_out"
        ? "The response timed out. Retry to continue."
        : reason === "failed_interrupted"
            ? "The run was interrupted before it could finish. Retry to continue."
            : "The stream ended unexpectedly. Retry to continue.";
    const retryable = isRetryableTerminalReason(reason);
    const base = buildClientErrorState(message);
    return {
        message: base.message,
        retryable,
        errorMeta: {
            ...base.errorMeta,
            code: reason === "timed_out"
                ? "RUN_STREAM_TIMEOUT"
                : reason === "failed_interrupted"
                    ? "RUN_STREAM_INTERRUPTED"
                    : "RUN_STREAM_UNEXPECTED_END",
            retryable,
        },
    };
}

export function isDeterministicCapabilityFailure(errorMeta: AIErrorEnvelope | null | undefined): boolean {
    return Boolean(
        errorMeta
        && !errorMeta.retryable
        && errorMeta.kind === "model_capability"
        && errorMeta.code === "UNSUPPORTED_REASONING_CAPABILITY",
    );
}

export function matchesCanonicalFailureFallback(params: {
    assistantText: string;
    streamError: unknown;
}): boolean {
    const assistantText = normalizedText(params.assistantText);
    if (!assistantText) return false;

    const withoutMessageFallback = normalizedText(buildFailureFallbackMessage(""));
    if (assistantText === withoutMessageFallback) return true;

    const formattedError = collapseWhitespace(formatStreamErrorForUI(params.streamError));
    const rawError = getBaseErrorMessage(params.streamError);
    const candidates = [formattedError, rawError]
        .map((message) => message.trim())
        .filter(Boolean)
        .map((message) => normalizedText(buildFailureFallbackMessage(message)));

    return candidates.includes(assistantText);
}
