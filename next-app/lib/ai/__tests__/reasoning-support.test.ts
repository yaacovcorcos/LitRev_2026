// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    getModelCapabilityRecord,
    getProviderForModel,
    getReasoningSupportTier,
    modelSupportsReasoning,
    USER_SELECTABLE_MODELS,
    type ReasoningSupportTier,
} from "../config";

describe("Reasoning support tiers", () => {
    describe("getReasoningSupportTier", () => {
        it("returns 'explicit' for Anthropic models", () => {
            expect(getReasoningSupportTier("claude-haiku-4-5")).toBe("explicit");
        });

        it("returns 'best_effort' for OpenAI and xAI reasoning models", () => {
            expect(getReasoningSupportTier("gpt-5.2")).toBe("best_effort");
            expect(getReasoningSupportTier("grok-4-1-fast")).toBe("best_effort");
            expect(getReasoningSupportTier("grok-4.3")).toBe("best_effort");
        });

        it("returns 'none' for models without reasoning support", () => {
            expect(getReasoningSupportTier("gpt-5-mini")).toBe("none");
            expect(getReasoningSupportTier("gemini-3-flash-preview")).toBe("none");
        });

        it("returns 'none' for unknown models (safe default)", () => {
            expect(getReasoningSupportTier("unknown-model-xyz")).toBe("none");
        });
    });

    describe("modelSupportsReasoning", () => {
        it("returns true for explicit and best_effort tiers", () => {
            expect(modelSupportsReasoning("claude-haiku-4-5")).toBe(true);
            expect(modelSupportsReasoning("gpt-5.2")).toBe(true);
            expect(modelSupportsReasoning("grok-4-1-fast")).toBe(true);
            expect(modelSupportsReasoning("grok-4.3")).toBe(true);
        });

        it("returns false for none tier", () => {
            expect(modelSupportsReasoning("gpt-5-mini")).toBe(false);
            expect(modelSupportsReasoning("gemini-3-flash-preview")).toBe(false);
        });

        it("returns false for unknown models", () => {
            expect(modelSupportsReasoning("unknown-model")).toBe(false);
        });
    });

    describe("USER_SELECTABLE_MODELS configuration", () => {
        it("all models have a reasoningSupport property", () => {
            const validTiers: ReasoningSupportTier[] = ["explicit", "best_effort", "none"];
            for (const model of USER_SELECTABLE_MODELS) {
                expect(validTiers).toContain(model.reasoningSupport);
            }
        });

        it("keeps selectable model reasoning metadata aligned with the capability registry", () => {
            for (const model of USER_SELECTABLE_MODELS) {
                const capabilityRecord = getModelCapabilityRecord(model.id);
                const reasoningSupport = model.reasoningSupport as ReasoningSupportTier;
                expect(capabilityRecord).toBeDefined();
                expect(reasoningSupport).toBe(capabilityRecord?.reasoningSupport);
                expect(modelSupportsReasoning(model.id)).toBe(reasoningSupport !== "none");
            }
        });

        it("includes Grok 4.3 as a selectable xAI model", () => {
            const selectable = USER_SELECTABLE_MODELS.find((model) => model.id === "grok-4.3");
            const capabilityRecord = getModelCapabilityRecord("grok-4.3");

            expect(selectable).toMatchObject({
                id: "grok-4.3",
                name: "Grok 4.3",
                provider: "xai",
                reasoningSupport: "best_effort",
                description: "Flagship xAI reasoning, 1M context",
                icon: "psychology",
            });
            expect(getProviderForModel("grok-4.3")).toBe("xai");
            expect(capabilityRecord).toMatchObject({
                contextWindow: 1000000,
                capabilities: ["chat", "vision", "tools"],
                temperatureSupport: "full",
            });
        });
    });
});
