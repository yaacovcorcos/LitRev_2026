import { describe, expect, it } from "vitest";
import {
    createToolExecutionErrorEnvelope,
    ensureToolResultErrorMeta,
} from "@/lib/server/ai/tool-errors";

describe("tool execution error envelopes", () => {
    it("classifies upstream rate limits and preserves retry timing", () => {
        const envelope = createToolExecutionErrorEnvelope({
            toolName: "search_semantic_scholar",
            error: {
                message: "Semantic Scholar rate limit exceeded",
                status: 429,
                headers: { "Retry-After": "2" },
            },
        });

        expect(envelope).toEqual({
            kind: "tool_execution",
            code: "TOOL_UPSTREAM_RATE_LIMITED",
            retryable: true,
            source: "tool_upstream",
            message: "Semantic Scholar rate limit exceeded",
            status: 429,
            headers: { "retry-after-ms": "2000" },
        });
    });

    it("classifies network timeouts as retryable upstream failures", () => {
        expect(createToolExecutionErrorEnvelope({
            toolName: "search_pubmed",
            error: new Error("request failed with ETIMEDOUT"),
        })).toMatchObject({
            kind: "tool_execution",
            code: "TOOL_UPSTREAM_TIMEOUT",
            retryable: true,
            source: "tool_upstream",
        });
    });

    it("classifies unknown executor failures as non-retryable", () => {
        expect(createToolExecutionErrorEnvelope({
            toolName: "read_protocol",
            error: new Error("Unexpected invariant violation"),
        })).toMatchObject({
            kind: "tool_execution",
            code: "TOOL_EXECUTION_FAILED",
            retryable: false,
            source: "tool_executor",
        });
    });

    it("preserves an existing structured error envelope", () => {
        const existing = {
            kind: "missing_prerequisite",
            code: "TOOL_PROJECT_REQUIRED",
            retryable: false,
            source: "tool_prerequisite_gate",
            message: "Select a project first.",
        } as const;

        expect(createToolExecutionErrorEnvelope({
            toolName: "read_protocol",
            error: { errorMeta: existing },
        })).toBe(existing);
    });

    it("adds metadata to plain tool errors without replacing existing metadata", () => {
        const normalized = ensureToolResultErrorMeta("search_openalex", {
            callId: "call-1",
            result: null,
            error: "OpenAlex gateway timeout",
        });
        expect(normalized.errorMeta).toMatchObject({
            code: "TOOL_UPSTREAM_TIMEOUT",
            retryable: true,
        });

        const existing = {
            kind: "tool_schema_validation",
            code: "TOOL_INPUT_VALIDATION_FAILED",
            retryable: false,
            source: "tool_validator",
            message: "Invalid input",
        } as const;
        const preserved = ensureToolResultErrorMeta("search_openalex", {
            callId: "call-2",
            result: null,
            error: "Invalid input",
            errorMeta: existing,
        });
        expect(preserved.errorMeta).toBe(existing);
    });
});
