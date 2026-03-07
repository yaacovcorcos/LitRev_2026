import { describe, expect, it } from "vitest";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
import { normalizeChatOptionsForModel } from "@/lib/server/ai/request-policy";

describe("request policy normalization", () => {
    it("omits temperature for OpenAI fixed-default models", () => {
        const normalized = normalizeChatOptionsForModel({
            model: "gpt-5.2",
            temperature: 0.1,
            includeReasoning: true,
        });

        expect(normalized.temperature).toBeUndefined();
        expect(normalized.includeReasoning).toBe(true);
    });

    it("disables reasoning for models without support", () => {
        const normalized = normalizeChatOptionsForModel({
            model: "gpt-5-mini",
            includeReasoning: true,
        });

        expect(normalized.temperature).toBeUndefined();
        expect(normalized.includeReasoning).toBe(false);
        expect(normalized.reasoningBudgetTokens).toBeUndefined();
    });

    it("blocks explicit reasoning budgets for best-effort models", () => {
        expect(() => normalizeChatOptionsForModel({
            model: "gpt-5.2",
            includeReasoning: true,
            reasoningBudgetTokens: 2048,
        })).toThrowError(AIErrorWithEnvelope);

        try {
            normalizeChatOptionsForModel({
                model: "gpt-5.2",
                includeReasoning: true,
                reasoningBudgetTokens: 2048,
            });
        } catch (error) {
            const wrapped = error as AIErrorWithEnvelope;
            expect(wrapped.errorMeta).toMatchObject({
                kind: "model_capability",
                code: "UNSUPPORTED_REASONING_CAPABILITY",
                retryable: false,
                source: "request_policy",
            });
        }
    });

    it("preserves explicit reasoning budgets for Anthropic models", () => {
        const normalized = normalizeChatOptionsForModel({
            model: "claude-haiku-4-5",
            includeReasoning: true,
            reasoningBudgetTokens: 4096,
        });

        expect(normalized.includeReasoning).toBe(true);
        expect(normalized.reasoningBudgetTokens).toBe(4096);
    });

    it("keeps temperature for models with full support", () => {
        const normalized = normalizeChatOptionsForModel({
            model: "grok-4-1-fast",
            temperature: 0.4,
        });

        expect(normalized.temperature).toBe(0.4);
    });
});
