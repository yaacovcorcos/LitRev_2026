import { describe, expect, it } from "vitest";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
import { normalizeChatOptionsForModel } from "@/lib/server/ai/request-policy";

describe("request policy normalization", () => {
    it.each([
        ["fast", 4_096],
        ["low", 8_192],
        ["medium", 16_384],
        ["high", 32_768],
        ["max", 65_536],
    ] as const)("uses the %s effort completion budget", (reasoningEffort, expectedMaxTokens) => {
        const normalized = normalizeChatOptionsForModel({
            model: "gpt-5.6-luna",
            reasoningEffort,
        });

        expect(normalized.maxTokens).toBe(expectedMaxTokens);
    });

    it("clamps the default completion budget to the model output limit", () => {
        const normalized = normalizeChatOptionsForModel({
            model: "qwen3.7-plus",
            reasoningEffort: "max",
        });

        expect(normalized.maxTokens).toBe(64_000);
    });

    it.each([
        ["fast", undefined],
        ["high", 16_384],
        ["max", 32_768],
    ] as const)("uses Qwen's %s provider reasoning budget", (reasoningEffort, expectedBudget) => {
        const normalized = normalizeChatOptionsForModel({
            model: "qwen3.7-plus",
            reasoningEffort,
        });

        expect(normalized.reasoningBudgetTokens).toBe(expectedBudget);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects invalid explicit completion budget %s",
        (maxTokens) => {
            expect(() => normalizeChatOptionsForModel({
                model: "gpt-5.6-luna",
                maxTokens,
            })).toThrowError(AIErrorWithEnvelope);
        },
    );

    it("rejects an explicit completion budget above the model limit", () => {
        expect(() => normalizeChatOptionsForModel({
            model: "qwen3.7-plus",
            maxTokens: 64_001,
        })).toThrowError(AIErrorWithEnvelope);
    });

    it("rejects a reasoning budget that leaves no visible output allowance", () => {
        expect(() => normalizeChatOptionsForModel({
            model: "qwen3.7-plus",
            maxTokens: 4_096,
            reasoningBudgetTokens: 4_096,
        })).toThrowError(AIErrorWithEnvelope);
    });

    it("keeps the product model ID and resolves the upstream model ID", () => {
        const normalized = normalizeChatOptionsForModel({ model: "deepseek-v4-pro" });

        expect(normalized.model).toBe("deepseek-v4-pro");
        expect(normalized.providerModelId).toBe("deepseek/deepseek-v4-pro");
        expect(normalized.providerDialect).toBe("deepseek");
        expect(normalized.reasoningEffort).toBe("high");
        expect(normalized.deliveryMode).toBe("standard");
    });

    it("keeps reasoning compute independent from reasoning visibility", () => {
        const normalized = normalizeChatOptionsForModel({
            model: "qwen3.7-plus",
            includeReasoning: false,
            reasoningEffort: "high",
            reasoningBudgetTokens: 4096,
        });

        expect(normalized.includeReasoning).toBe(false);
        expect(normalized.reasoningEffort).toBe("high");
        expect(normalized.reasoningBudgetTokens).toBe(4096);
    });

    it("omits temperature for fixed-default models", () => {
        const normalized = normalizeChatOptionsForModel({
            model: "gpt-5.6-terra",
            temperature: 0.1,
        });

        expect(normalized.temperature).toBeUndefined();
    });

    it("rejects reasoning intensities the selected model does not support", () => {
        expect(() => normalizeChatOptionsForModel({
            model: "deepseek-v4-flash",
            reasoningEffort: "medium",
        })).toThrowError(AIErrorWithEnvelope);
    });

    it("rejects paid priority when the selected model has no priority tier", () => {
        expect(() => normalizeChatOptionsForModel({
            model: "qwen3.7-plus",
            deliveryMode: "priority",
        })).toThrowError(AIErrorWithEnvelope);
    });

    it("accepts hydrated images for vision models", () => {
        const normalized = normalizeChatOptionsForModel({
            model: "qwen3.7-plus",
            imageInputs: [{
                fileAssetId: "asset-1",
                filename: "figure.png",
                mimeType: "image/png",
                dataUrl: "data:image/png;base64,AAAA",
            }],
        });

        expect(normalized.imageInputs).toHaveLength(1);
    });

    it("keeps WebP available for Qwen", () => {
        const normalized = normalizeChatOptionsForModel({
            model: "qwen3.7-plus",
            imageInputs: [{
                fileAssetId: "asset-webp",
                filename: "figure.webp",
                mimeType: "image/webp",
                dataUrl: "data:image/webp;base64,AAAA",
            }],
        });

        expect(normalized.imageInputs).toHaveLength(1);
    });

    it.each(["image/png", "image/jpeg"] as const)(
        "accepts Grok %s inputs",
        (mimeType) => {
            const normalized = normalizeChatOptionsForModel({
                model: "grok-4.5",
                imageInputs: [{
                    fileAssetId: `asset-${mimeType}`,
                    filename: mimeType === "image/png" ? "figure.png" : "figure.jpg",
                    mimeType,
                    dataUrl: `data:${mimeType};base64,AAAA`,
                }],
            });

            expect(normalized.imageInputs).toHaveLength(1);
        },
    );

    it("rejects Grok WebP with a typed local error", () => {
        expect(() => normalizeChatOptionsForModel({
            model: "grok-4.5",
            imageInputs: [{
                fileAssetId: "asset-webp",
                filename: "figure.webp",
                mimeType: "image/webp",
                dataUrl: "data:image/webp;base64,AAAA",
            }],
        })).toThrowError(expect.objectContaining({
            errorCode: "UNSUPPORTED_IMAGE_FORMAT",
        }));
    });

    it("rejects images for models without vision", () => {
        expect(() => normalizeChatOptionsForModel({
            model: "deepseek-v4-pro",
            imageInputs: [{
                fileAssetId: "asset-1",
                filename: "figure.png",
                mimeType: "image/png",
                dataUrl: "data:image/png;base64,AAAA",
            }],
        })).toThrowError(AIErrorWithEnvelope);
    });

    it("rejects malformed server-hydrated image data", () => {
        expect(() => normalizeChatOptionsForModel({
            model: "gpt-5.6-luna",
            imageInputs: [{
                fileAssetId: "asset-1",
                filename: "figure.png",
                mimeType: "image/png",
                dataUrl: "https://example.com/figure.png",
            }],
        })).toThrowError(AIErrorWithEnvelope);
    });
});
