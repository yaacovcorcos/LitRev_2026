import { describe, expect, it } from "vitest";
import {
    buildClientErrorState,
    extractLegacyRecoveryError,
    formatStreamErrorForUI,
    isRetryableTerminalReason,
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

    it("marks only timed out and failed network terminal reasons as retryable", () => {
        expect(isRetryableTerminalReason("timed_out")).toBe(true);
        expect(isRetryableTerminalReason("failed_network")).toBe(true);
        expect(isRetryableTerminalReason("failed_server")).toBe(false);
    });
});
