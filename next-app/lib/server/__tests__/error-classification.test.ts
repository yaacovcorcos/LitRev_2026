import { describe, expect, it } from "vitest";
import {
    classifyAIError,
    isContextOverflowMessage,
    isRetryableReason,
    toAIErrorEnvelope,
} from "@/lib/server/ai/error-classification";

describe("classifyAIError", () => {
    it("classifies rate limits from status code", () => {
        const classified = classifyAIError({ message: "Too many requests", statusCode: 429 });
        expect(classified.reason).toBe("rate_limit");
        expect(classified.retryable).toBe(true);
    });

    it("classifies authentication failures", () => {
        const classified = classifyAIError({ message: "Unauthorized", status: 401 });
        expect(classified.reason).toBe("auth");
        expect(classified.retryable).toBe(false);
    });

    it("classifies context overflow from provider messages", () => {
        const classified = classifyAIError({ message: "This request exceeds the context window" });
        expect(classified.reason).toBe("context_overflow");
        expect(classified.retryable).toBe(false);
    });

    it("classifies daily token limit failures separately from context overflow", () => {
        const classified = classifyAIError({ message: "Daily token limit exceeded. Maximum 300000 tokens per day." });
        expect(classified.reason).toBe("usage_limit");
        expect(classified.retryable).toBe(false);
    });

    it("classifies timeout and keeps retryable=true", () => {
        const classified = classifyAIError({ message: "gateway timeout", statusCode: 504 });
        expect(classified.reason).toBe("timeout");
        expect(classified.retryable).toBe(true);
    });

    it("keeps AbortError non-retryable and typed so runtime cancellation is not retried as provider failure", () => {
        const error = new DOMException("Aborted", "AbortError");
        const classified = classifyAIError(error);
        const envelope = toAIErrorEnvelope(error);

        expect(classified).toMatchObject({
            code: "ABORTED",
            kind: "runtime_abort",
            retryable: false,
        });
        expect(envelope).toMatchObject({
            code: "ABORTED",
            kind: "runtime_abort",
            retryable: false,
        });
    });

    it("classifies prisma connection timeouts as database failures", () => {
        const classified = classifyAIError({ message: "Connection terminated due to connection timeout" });
        expect(classified.reason).toBe("timeout");
        expect(classified.code).toBe("DATABASE_CONNECTION_TIMEOUT");
        expect(classified.kind).toBe("database_connection");
        expect(classified.source).toBe("database_connection");
        expect(classified.retryable).toBe(true);
    });

    it("classifies prisma reachability failures as database failures", () => {
        const classified = classifyAIError({
            message: "Can't reach database server at localhost:5432",
            code: "P1001",
        });
        expect(classified.reason).toBe("timeout");
        expect(classified.code).toBe("DATABASE_CONNECTION_FAILED");
        expect(classified.kind).toBe("database_connection");
        expect(classified.source).toBe("database_connection");
    });

    it("extracts retry-after from headers", () => {
        const classified = classifyAIError({
            message: "Too many requests",
            statusCode: 429,
            errorHeaders: { "retry-after": "2" },
        });
        expect(classified.retryAfterMs).toBe(2000);
    });

    it("uses the structured envelope for tool-call parse failures", () => {
        const classified = classifyAIError({
            errorMeta: {
                kind: "tool_call_parse",
                code: "TOOL_CALL_ARGS_PARSE_FAILED",
                retryable: false,
                source: "provider_tool_call",
                message: "The model returned invalid arguments for update_protocol.",
            },
        });
        expect(classified.reason).toBe("format");
        expect(classified.code).toBe("TOOL_CALL_ARGS_PARSE_FAILED");
        expect(classified.retryable).toBe(false);
    });

    it("preserves context overflow classification for structured envelopes", () => {
        const classified = classifyAIError({
            errorMeta: {
                kind: "provider_request",
                code: "context_length_exceeded",
                retryable: false,
                source: "provider_request",
                message: "maximum context length is 128000 tokens",
            },
        });
        expect(classified.reason).toBe("context_overflow");
        expect(classified.retryable).toBe(false);
    });

    it("preserves usage-limit classification for structured envelopes", () => {
        const classified = classifyAIError({
            errorMeta: {
                kind: "runtime",
                code: "DAILY_TOKEN_LIMIT_EXCEEDED",
                retryable: false,
                source: "runtime",
                message: "Daily token limit exceeded. Maximum 300000 tokens per day.",
            },
        });
        expect(classified.reason).toBe("usage_limit");
        expect(classified.retryable).toBe(false);
    });

    it("preserves shared database classification through toAIErrorEnvelope defaults", () => {
        const envelope = toAIErrorEnvelope(
            { message: "Connection terminated due to connection timeout" },
            {
                kind: "runtime",
                source: "runtime",
                message: "Connection terminated due to connection timeout",
            },
        );
        expect(envelope).toMatchObject({
            kind: "database_connection",
            source: "database_connection",
            code: "DATABASE_CONNECTION_TIMEOUT",
            retryable: true,
        });
    });
});

describe("helpers", () => {
    it("detects overflow phrases", () => {
        expect(isContextOverflowMessage("maximum context length is 128000 tokens")).toBe(true);
    });

    it("marks only rate_limit/timeout as retryable reasons", () => {
        expect(isRetryableReason("rate_limit")).toBe(true);
        expect(isRetryableReason("timeout")).toBe(true);
        expect(isRetryableReason("context_overflow")).toBe(false);
        expect(isRetryableReason("auth")).toBe(false);
    });
});
