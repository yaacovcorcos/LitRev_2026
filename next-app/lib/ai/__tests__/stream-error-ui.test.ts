import { describe, expect, it } from "vitest";
import type { AIErrorEnvelope } from "@/types/ai";
import {
    buildUnexpectedTerminalErrorState,
    buildClientErrorState,
    clearRunScopedRenderedErrors,
    clearRunScopedRecoveryState,
    extractLegacyRecoveryError,
    formatStreamErrorForUI,
    hasCanonicalFailureFallbackText,
    hasRenderedErrorMatch,
    isDeterministicCapabilityFailure,
    isRetryableTerminalReason,
    isSameRenderedError,
    matchesCanonicalFailureFallback,
    reconcileRunScopedRecoveryState,
    reconcileRunScopedRenderedErrors,
    shouldSuppressClientFallback,
} from "@/lib/ai/stream-error-ui";

type RecoveryStateTestItem = {
    id: string;
    message?: string;
    errorMeta?: AIErrorEnvelope;
    checkpoint?: {
        label: string;
        runId?: string | null;
        checkpointKind?: "standard" | "recovery" | null;
    };
};

describe("formatStreamErrorForUI", () => {
    it("extracts and rewrites Anthropic thinking/max_tokens mismatch errors", () => {
        const raw = '400 {"type":"error","error":{"type":"invalid_request_error","message":"`max_tokens` must be greater than `thinking.budget_tokens`."}}';
        expect(formatStreamErrorForUI(raw)).toBe(
            "Claude could not run this request with the current reasoning settings. Retry, or set reasoning to Off.",
        );
    });

    it("strips transport wrapper and returns nested provider message", () => {
        const raw = '400 {"error":{"message":"Provider specific failure"}}';
        expect(formatStreamErrorForUI(raw)).toBe("Provider specific failure");
    });

    it("normalizes common overload errors", () => {
        expect(formatStreamErrorForUI("429 too many requests")).toBe(
            "The model is temporarily busy. Please retry in a moment.",
        );
    });

    it("renders daily token limits as quota errors instead of context overflow", () => {
        expect(formatStreamErrorForUI("Daily token limit exceeded. Maximum 300000 tokens per day.")).toBe(
            "Daily token limit reached for your workspace. Try again tomorrow.",
        );
    });

    it("keeps token-limit overflow phrasing mapped to the context-overflow UI", () => {
        expect(formatStreamErrorForUI("Request failed because it exceeded model token limit.")).toBe(
            "This request is too large for the selected model. Try a shorter prompt.",
        );
    });

    it("uses structured envelope messages for tool-call parse failures", () => {
        expect(formatStreamErrorForUI({
            errorMeta: {
                kind: "tool_call_parse",
                code: "TOOL_CALL_ARGS_PARSE_FAILED",
                retryable: false,
                source: "provider_tool_call",
                message: "The model returned invalid arguments for update_protocol, so the action was not run.",
            },
        })).toBe("The model returned invalid arguments for update_protocol, so the action was not run.");
    });

    it("renders structured database connection timeouts as database issues", () => {
        expect(formatStreamErrorForUI({
            errorMeta: {
                kind: "database_connection",
                code: "DATABASE_CONNECTION_TIMEOUT",
                retryable: true,
                source: "database_connection",
                message: "Connection terminated due to connection timeout",
            },
        })).toBe("The app could not reach the database in time. Please retry.");
    });

    it("preserves structured retryability in client error state", () => {
        const state = buildClientErrorState({
            errorMeta: {
                kind: "tool_schema_validation",
                code: "TOOL_VALIDATION_FAILED",
                retryable: false,
                source: "tool_validator",
                message: "Protocol update failed validation.",
                status: 400,
            },
        });

        expect(state).toMatchObject({
            message: "Protocol update failed validation.",
            retryable: false,
            errorMeta: {
                code: "TOOL_VALIDATION_FAILED",
                retryable: false,
                status: 400,
            },
        });
    });

    it("marks plan execution recovery text as non-retryable", () => {
        expect(extractLegacyRecoveryError("Plan execution failed: Step 2 could not complete.")).toEqual({
            message: "Step 2 could not complete.",
            retryable: false,
        });
    });

    it("suppresses duplicate client fallback when a non-retryable error already has assistant content", () => {
        expect(shouldSuppressClientFallback({
            errorMeta: {
                kind: "tool_call_parse",
                code: "TOOL_CALL_ARGS_PARSE_FAILED",
                retryable: false,
                source: "provider_tool_call",
                message: "Bad arguments",
            },
            hasAssistantContent: true,
        })).toBe(true);
    });

    it("suppresses fallback when the same structured error is already rendered", () => {
        expect(shouldSuppressClientFallback({
            errorMeta: {
                kind: "tool_call_parse",
                code: "TOOL_CALL_ARGS_PARSE_FAILED",
                retryable: false,
                source: "provider_tool_call",
                message: "Bad arguments",
            },
            hasAssistantContent: false,
            hasRenderedError: true,
        })).toBe(true);
    });

    it("matches equivalent rendered errors across generic item collections", () => {
        const items = [{
            text: "Bad arguments",
            meta: {
                kind: "tool_call_parse",
                code: "TOOL_CALL_ARGS_PARSE_FAILED",
                retryable: false,
                source: "provider_tool_call",
                message: "Bad arguments",
            },
        }];

        expect(hasRenderedErrorMatch({
            items,
            nextMessage: "Bad arguments",
            nextMeta: {
                kind: "tool_call_parse",
                code: "TOOL_CALL_ARGS_PARSE_FAILED",
                retryable: false,
                source: "provider_tool_call",
                message: "Bad arguments",
            },
            getMessage: (item) => item.text,
            getErrorMeta: (item) => item.meta,
        })).toBe(true);
    });

    it("matches canonical fallback text across generic item collections", () => {
        const items = [{
            text: "I couldn't complete that request: GPT-5.2 does not support an explicit reasoning budget.",
        }];

        expect(hasCanonicalFailureFallbackText({
            items,
            streamError: {
                kind: "model_capability",
                code: "UNSUPPORTED_REASONING_CAPABILITY",
                retryable: false,
                source: "request_policy",
                message: "GPT-5.2 does not support an explicit reasoning budget.",
            },
            getText: (item) => item.text,
        })).toBe(true);
    });

    it("matches rendered structured errors by code, source, and message", () => {
        expect(isSameRenderedError({
            existingMessage: "Bad arguments",
            existingMeta: {
                kind: "tool_call_parse",
                code: "TOOL_CALL_ARGS_PARSE_FAILED",
                retryable: false,
                source: "provider_tool_call",
                message: "Bad arguments",
            },
            nextMessage: "Bad arguments",
            nextMeta: {
                kind: "tool_call_parse",
                code: "TOOL_CALL_ARGS_PARSE_FAILED",
                retryable: false,
                source: "provider_tool_call",
                message: "Bad arguments",
            },
        })).toBe(true);
    });

    it("does not collapse different structured errors that only share a rendered message", () => {
        expect(isSameRenderedError({
            existingMessage: "The model is temporarily busy. Please retry in a moment.",
            existingMeta: {
                kind: "provider_request",
                code: "RATE_LIMIT_A",
                retryable: true,
                source: "provider_request",
                message: "429 provider A rate limit",
            },
            nextMessage: "The model is temporarily busy. Please retry in a moment.",
            nextMeta: {
                kind: "provider_request",
                code: "RATE_LIMIT_B",
                retryable: true,
                source: "provider_request",
                message: "429 provider B rate limit",
            },
        })).toBe(false);
    });

    it("marks interrupted, timed out, and failed network terminal reasons as retryable", () => {
        expect(isRetryableTerminalReason("failed_interrupted")).toBe(true);
        expect(isRetryableTerminalReason("timed_out")).toBe(true);
        expect(isRetryableTerminalReason("failed_network")).toBe(true);
        expect(isRetryableTerminalReason("failed_server")).toBe(false);
    });

    it("builds retryable unexpected terminal errors from terminal reason", () => {
        expect(buildUnexpectedTerminalErrorState("timed_out")).toMatchObject({
            message: "The response timed out. Retry to continue.",
            retryable: true,
            errorMeta: {
                retryable: true,
            },
        });

        expect(buildUnexpectedTerminalErrorState("failed_interrupted")).toMatchObject({
            message: "The run was interrupted before it could finish. Retry to continue.",
            retryable: true,
            errorMeta: {
                code: "RUN_STREAM_INTERRUPTED",
                retryable: true,
            },
        });

        expect(buildUnexpectedTerminalErrorState("failed_server")).toMatchObject({
            message: "The stream ended unexpectedly. Retry to continue.",
            retryable: false,
            errorMeta: {
                retryable: false,
            },
        });
    });

    it("matches canonical fallback with reason text from structured errors", () => {
        expect(matchesCanonicalFailureFallback({
            assistantText: "I couldn't complete that request: GPT-5.2 does not support an explicit reasoning budget.",
            streamError: {
                kind: "model_capability",
                code: "UNSUPPORTED_REASONING_CAPABILITY",
                retryable: false,
                source: "request_policy",
                message: "GPT-5.2 does not support an explicit reasoning budget.",
            },
        })).toBe(true);
    });

    it("matches canonical fallback without a reason body", () => {
        expect(matchesCanonicalFailureFallback({
            assistantText: "I couldn't complete that request because the action failed before I could produce a useful answer.",
            streamError: {
                kind: "model_capability",
                code: "UNSUPPORTED_REASONING_CAPABILITY",
                retryable: false,
                source: "request_policy",
                message: "",
            },
        })).toBe(true);
    });

    it("matches canonical fallback when assistant content uses the raw daily-limit message", () => {
        expect(matchesCanonicalFailureFallback({
            assistantText: "I couldn't complete that request: Daily token limit exceeded. Maximum 300000 tokens per day.",
            streamError: "Daily token limit exceeded. Maximum 300000 tokens per day.",
        })).toBe(true);
    });

    it("flags deterministic capability failures", () => {
        expect(isDeterministicCapabilityFailure({
            kind: "model_capability",
            code: "UNSUPPORTED_REASONING_CAPABILITY",
            retryable: false,
            source: "request_policy",
            message: "Unsupported budget",
        })).toBe(true);
        expect(isDeterministicCapabilityFailure({
            kind: "model_capability",
            code: "UNSUPPORTED_REASONING_CAPABILITY",
            retryable: true,
            source: "request_policy",
            message: "Unsupported budget",
        })).toBe(false);
    });

    it("replaces a weaker same-run timeout with an active-run conflict", () => {
        const reconciled = reconcileRunScopedRenderedErrors({
            items: [{
                id: "error-timeout",
                message: "Run interrupted and recovery timed out. Choose how to continue.",
                errorMeta: {
                    kind: "runtime",
                    code: "RUN_RECOVERY_TIMEOUT",
                    retryable: true,
                    source: "runtime",
                    message: "Run interrupted and recovery timed out. Choose how to continue.",
                    runId: "run-1",
                    recoveryRecommendation: "retry" as const,
                },
            }],
            nextMessage: "The active run is still holding this conversation. Choose how to continue.",
            nextMeta: {
                kind: "run_conflict",
                code: "ACTIVE_RUN_EXISTS",
                retryable: false,
                source: "conversation_run_lock",
                message: "The active run is still holding this conversation. Choose how to continue.",
                runId: "run-1",
                activeRunId: "run-1",
                recoveryRecommendation: "stop_and_retry",
            },
            getMessage: (item) => item.message,
            getErrorMeta: (item) => item.errorMeta,
        });

        expect(reconciled.items).toEqual([]);
        expect(reconciled.shouldAppend).toBe(true);
    });

    it("suppresses a weaker same-run fallback when stronger recovery truth exists", () => {
        const reconciled = reconcileRunScopedRenderedErrors({
            items: [{
                id: "error-conflict",
                message: "The active run is still holding this conversation. Choose how to continue.",
                errorMeta: {
                    kind: "run_conflict",
                    code: "ACTIVE_RUN_EXISTS",
                    retryable: false,
                    source: "conversation_run_lock",
                    message: "The active run is still holding this conversation. Choose how to continue.",
                    runId: "run-1",
                    activeRunId: "run-1",
                    recoveryRecommendation: "stop_and_retry" as const,
                },
            }],
            nextMessage: "The stream ended unexpectedly. Retry to continue.",
            nextMeta: {
                kind: "runtime",
                code: "RUN_STREAM_UNEXPECTED_END",
                retryable: false,
                source: "runtime",
                message: "The stream ended unexpectedly. Retry to continue.",
                runId: "run-1",
            },
            getMessage: (item) => item.message,
            getErrorMeta: (item) => item.errorMeta,
        });

        expect(reconciled.items).toHaveLength(1);
        expect(reconciled.shouldAppend).toBe(false);
    });

    it("clears prior same-run errors after terminal reconciliation", () => {
        const remaining = clearRunScopedRenderedErrors({
            items: [
                {
                    id: "error-run-1",
                    errorMeta: {
                        kind: "runtime",
                        code: "RUN_RECOVERY_TIMEOUT",
                        retryable: true,
                        source: "runtime",
                        message: "timeout",
                        runId: "run-1",
                    },
                },
                {
                    id: "error-run-2",
                    errorMeta: {
                        kind: "runtime",
                        code: "RUN_RECOVERY_TIMEOUT",
                        retryable: true,
                        source: "runtime",
                        message: "timeout",
                        runId: "run-2",
                    },
                },
            ],
            runId: "run-1",
            getErrorMeta: (item) => item.errorMeta,
        });

        expect(remaining).toEqual([
            {
                id: "error-run-2",
                errorMeta: {
                    kind: "runtime",
                    code: "RUN_RECOVERY_TIMEOUT",
                    retryable: true,
                    source: "runtime",
                    message: "timeout",
                    runId: "run-2",
                },
            },
        ]);
    });

    it("replaces a same-run reconnect checkpoint with stronger recovery truth", () => {
        const reconciled = reconcileRunScopedRecoveryState({
            items: [{
                id: "checkpoint-run-1",
                checkpoint: {
                    label: "Run interrupted. Reconnecting to the active run…",
                    runId: "run-1",
                    checkpointKind: "recovery" as const,
                },
            }] satisfies RecoveryStateTestItem[],
            nextMessage: "The active run stopped making durable progress. Choose how to continue.",
            nextMeta: {
                kind: "runtime",
                code: "RUN_RECOVERY_REQUIRES_USER_ACTION",
                retryable: false,
                source: "runtime",
                message: "The active run stopped making durable progress. Choose how to continue.",
                runId: "run-1",
                activeRunId: "run-1",
                recoveryRecommendation: "stop_and_retry" as const,
            },
            getMessage: (item: RecoveryStateTestItem) => item.message ?? null,
            getErrorMeta: (item: RecoveryStateTestItem) => item.errorMeta ?? null,
            getCheckpointMeta: (item: RecoveryStateTestItem) => item.checkpoint ?? null,
        });

        expect(reconciled.items).toEqual([]);
        expect(reconciled.shouldAppend).toBe(true);
    });

    it("suppresses a same-run reconnect checkpoint when stronger recovery truth already exists", () => {
        const reconciled = reconcileRunScopedRecoveryState({
            items: [{
                id: "error-run-1",
                message: "The active run stopped making durable progress. Choose how to continue.",
                errorMeta: {
                    kind: "runtime",
                    code: "RUN_RECOVERY_REQUIRES_USER_ACTION",
                    retryable: false,
                    source: "runtime",
                    message: "The active run stopped making durable progress. Choose how to continue.",
                    runId: "run-1",
                    activeRunId: "run-1",
                    recoveryRecommendation: "stop_and_retry" as const,
                },
            }] satisfies RecoveryStateTestItem[],
            nextCheckpoint: {
                label: "Run interrupted. Reconnecting to the active run…",
                runId: "run-1",
                checkpointKind: "recovery" as const,
            },
            getMessage: (item: RecoveryStateTestItem) => item.message ?? null,
            getErrorMeta: (item: RecoveryStateTestItem) => item.errorMeta ?? null,
            getCheckpointMeta: (item: RecoveryStateTestItem) => item.checkpoint ?? null,
        });

        expect(reconciled.items).toHaveLength(1);
        expect(reconciled.shouldAppend).toBe(false);
    });

    it("clears same-run recovery checkpoints and errors after terminal reconciliation", () => {
        const remaining = clearRunScopedRecoveryState({
            items: [
                {
                    id: "checkpoint-run-1",
                    checkpoint: {
                        label: "Run interrupted. Reconnecting to the active run…",
                        runId: "run-1",
                        checkpointKind: "recovery" as const,
                    },
                },
                {
                    id: "error-run-1",
                    errorMeta: {
                        kind: "runtime",
                        code: "RUN_RECOVERY_TIMEOUT",
                        retryable: true,
                        source: "runtime",
                        message: "timeout",
                        runId: "run-1",
                    },
                },
                {
                    id: "checkpoint-run-2",
                    checkpoint: {
                        label: "Run interrupted. Reconnecting to the active run…",
                        runId: "run-2",
                        checkpointKind: "recovery" as const,
                    },
                },
            ] satisfies RecoveryStateTestItem[],
            runId: "run-1",
            getErrorMeta: (item: RecoveryStateTestItem) => item.errorMeta ?? null,
            getCheckpointMeta: (item: RecoveryStateTestItem) => item.checkpoint ?? null,
        });

        expect(remaining).toEqual([
            {
                id: "checkpoint-run-2",
                checkpoint: {
                        label: "Run interrupted. Reconnecting to the active run…",
                    runId: "run-2",
                    checkpointKind: "recovery",
                },
            },
        ]);
    });
});
