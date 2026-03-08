import { describe, expect, it } from "vitest";
import {
    buildClientErrorState,
    extractLegacyRecoveryError,
    formatStreamErrorForUI,
    isDeterministicCapabilityFailure,
    isRetryableTerminalReason,
    isSameRenderedError,
    matchesCanonicalFailureFallback,
    shouldSuppressClientFallback,
} from "@/lib/ai/stream-error-ui";

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

    it("marks only timed out and failed network terminal reasons as retryable", () => {
        expect(isRetryableTerminalReason("timed_out")).toBe(true);
        expect(isRetryableTerminalReason("failed_network")).toBe(true);
        expect(isRetryableTerminalReason("failed_server")).toBe(false);
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
});
