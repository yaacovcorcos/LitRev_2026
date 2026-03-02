import { describe, expect, it } from "vitest";
import { computeAnthropicThinkingBudget } from "@/lib/server/ai/providers/anthropic";

describe("computeAnthropicThinkingBudget", () => {
    it("uses conservative defaults by reasoning mode", () => {
        expect(computeAnthropicThinkingBudget(2048, undefined, "summary")).toBe(512);
        expect(computeAnthropicThinkingBudget(2048, undefined, "full")).toBe(1024);
    });

    it("keeps budget strictly below max_tokens", () => {
        expect(computeAnthropicThinkingBudget(2048, 4096, "full")).toBe(2047);
        expect(computeAnthropicThinkingBudget(512, 5000, "summary")).toBe(511);
    });

    it("respects explicit low budgets and handles small max token values", () => {
        expect(computeAnthropicThinkingBudget(2048, 64, "full")).toBe(64);
        expect(computeAnthropicThinkingBudget(2, 500, "full")).toBe(1);
        expect(computeAnthropicThinkingBudget(1, 500, "full")).toBeNull();
    });
});

