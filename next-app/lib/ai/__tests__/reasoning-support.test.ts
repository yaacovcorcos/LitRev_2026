// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    DEFAULT_SELECTABLE_MODEL_ID,
    getModelCapabilityRecord,
    getProviderForModel,
    getReasoningSupportTier,
    getReasoningVisibilitySupport,
    modelSupportsReasoning,
    SELECTABLE_MODEL_IDS,
    USER_SELECTABLE_MODELS,
} from "../config";

describe("model portfolio reasoning contracts", () => {
    it("publishes exactly the approved seven models in the approved order", () => {
        expect(USER_SELECTABLE_MODELS.map((model) => model.id)).toEqual([...SELECTABLE_MODEL_IDS]);
        expect(DEFAULT_SELECTABLE_MODEL_ID).toBe("gpt-5.6-luna");
        expect(USER_SELECTABLE_MODELS).toHaveLength(7);
        expect(USER_SELECTABLE_MODELS.some((model) => ["gpt-5.2", "grok-4-1-fast", "grok-4.3"].includes(model.id))).toBe(false);
    });

    it("keeps effort choices and defaults capability-specific", () => {
        expect(getModelCapabilityRecord("deepseek-v4-flash")?.reasoningEfforts).toEqual(["fast", "high", "max"]);
        expect(getModelCapabilityRecord("deepseek-v4-pro")?.defaultReasoningEffort).toBe("high");
        expect(getModelCapabilityRecord("qwen3.7-plus")?.reasoningEfforts).toEqual(["fast", "high", "max"]);
        expect(getModelCapabilityRecord("grok-4.5")?.reasoningEfforts).toEqual(["fast", "medium", "high"]);
        expect(getModelCapabilityRecord("gpt-5.6-luna")?.defaultReasoningEffort).toBe("medium");
    });

    it("marks all seven as reasoning-capable while unknown models fail closed", () => {
        for (const model of USER_SELECTABLE_MODELS) {
            expect(getReasoningSupportTier(model.id)).toBe("explicit");
            expect(modelSupportsReasoning(model.id)).toBe(true);
        }
        expect(getReasoningSupportTier("unknown-model")).toBe("none");
        expect(modelSupportsReasoning("unknown-model")).toBe(false);
    });

    it("separates compute effort from the exact provider-visible reasoning contract", () => {
        expect(Object.fromEntries(USER_SELECTABLE_MODELS.map((model) => [
            model.id,
            getReasoningVisibilitySupport(model.id),
        ]))).toEqual({
            "deepseek-v4-flash": "none",
            "gpt-5.6-luna": "none",
            "deepseek-v4-pro": "none",
            "gpt-5.6-terra": "none",
            "qwen3.7-plus": "none",
            "grok-4.5": "none",
            "gpt-5.6-sol": "none",
        });
        expect(getReasoningVisibilitySupport("unknown-model")).toBe("none");
    });

    it("keeps routing, price, role and premium metadata complete", () => {
        for (const model of USER_SELECTABLE_MODELS) {
            expect(getProviderForModel(model.id)).toBeTruthy();
            expect(model.badge).toBeTruthy();
            expect(model.description).toBeTruthy();
            expect(model.pricing.currency).toBe("USD");
            expect(model.pricing.inputPerMillion).toBeGreaterThan(0);
            expect(model.pricing.outputPerMillion).toBeGreaterThan(0);
            expect(model.pricing.standardizedLargeTaskUsd).toBeGreaterThan(0);
        }
        expect(USER_SELECTABLE_MODELS.find((model) => model.id === "gpt-5.6-sol")?.premium).toBe(true);
        expect(USER_SELECTABLE_MODELS.find((model) => model.id === "gpt-5.6-terra")?.role).toBe("Advanced Research");
    });

    it("locks the dated USD token prices and shared large-task estimate", () => {
        const expectedPricing = {
            "deepseek-v4-flash": { input: 0.14, cached: 0.0028, cacheWrite: undefined, output: 0.28, largeTask: 0.084 },
            "gpt-5.6-luna": { input: 1, cached: 0.1, cacheWrite: 1.25, output: 6, largeTask: 0.8 },
            "deepseek-v4-pro": { input: 0.435, cached: 0.003625, cacheWrite: undefined, output: 0.87, largeTask: 0.261 },
            "gpt-5.6-terra": { input: 2.5, cached: 0.25, cacheWrite: 3.125, output: 15, largeTask: 2 },
            "qwen3.7-plus": { input: 0.4, cached: 0.08, cacheWrite: 0.5, output: 1.6, largeTask: 0.28 },
            "grok-4.5": { input: 2, cached: 0.5, cacheWrite: undefined, output: 6, largeTask: 1.3 },
            "gpt-5.6-sol": { input: 5, cached: 0.5, cacheWrite: 6.25, output: 30, largeTask: 4 },
        } as const;

        for (const model of USER_SELECTABLE_MODELS) {
            const expected = expectedPricing[model.id];
            expect(model.pricing.asOf).toBe("2026-07-12");
            expect({
                input: model.pricing.inputPerMillion,
                cached: model.pricing.cachedInputPerMillion,
                cacheWrite: model.pricing.cacheWriteInputPerMillion,
                output: model.pricing.outputPerMillion,
                largeTask: model.pricing.standardizedLargeTaskUsd,
            }).toEqual(expected);
            expect(model.pricing.standardizedLargeTaskUsd).toBeCloseTo(
                (0.5 * model.pricing.inputPerMillion) + (0.05 * model.pricing.outputPerMillion),
                10,
            );
        }
    });
});
