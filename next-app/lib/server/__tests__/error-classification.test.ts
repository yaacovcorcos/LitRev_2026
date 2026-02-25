import { describe, expect, it } from "vitest";
import {
    classifyAIError,
    isContextOverflowMessage,
    isRetryableReason,
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

    it("classifies timeout and keeps retryable=true", () => {
        const classified = classifyAIError({ message: "gateway timeout", statusCode: 504 });
        expect(classified.reason).toBe("timeout");
        expect(classified.retryable).toBe(true);
    });

    it("extracts retry-after from headers", () => {
        const classified = classifyAIError({
            message: "Too many requests",
            statusCode: 429,
            errorHeaders: { "retry-after": "2" },
        });
        expect(classified.retryAfterMs).toBe(2000);
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
