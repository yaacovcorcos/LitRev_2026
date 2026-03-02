import { describe, expect, it } from "vitest";
import { formatStreamErrorForUI } from "@/lib/ai/stream-error-ui";

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
});

