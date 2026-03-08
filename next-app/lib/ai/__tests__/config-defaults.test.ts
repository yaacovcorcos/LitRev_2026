import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfigModule() {
    vi.resetModules();
    return import("../config");
}

describe("AI config defaults", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("keeps the fallback provider aligned with the fallback default model", async () => {
        vi.stubEnv("AI_DEFAULT_MODEL", undefined);
        vi.stubEnv("AI_DEFAULT_PROVIDER", undefined);

        const { AI_CONFIG, DEFAULT_SELECTABLE_MODEL_ID, getProviderForModel } = await loadConfigModule();
        expect(AI_CONFIG.defaultModel).toBe(DEFAULT_SELECTABLE_MODEL_ID);
        expect(AI_CONFIG.defaultProvider).toBe(getProviderForModel(DEFAULT_SELECTABLE_MODEL_ID));
    });

    it("derives the fallback provider from an env-selected default model when provider is unset", async () => {
        vi.stubEnv("AI_DEFAULT_MODEL", "gpt-5.2");
        vi.stubEnv("AI_DEFAULT_PROVIDER", undefined);

        const { AI_CONFIG } = await loadConfigModule();
        expect(AI_CONFIG.defaultProvider).toBe("openai");
    });

    it("preserves an explicit provider override even when it differs from the model fallback", async () => {
        vi.stubEnv("AI_DEFAULT_MODEL", "grok-4-1-fast");
        vi.stubEnv("AI_DEFAULT_PROVIDER", "anthropic");

        const { AI_CONFIG } = await loadConfigModule();
        expect(AI_CONFIG.defaultProvider).toBe("anthropic");
    });
});
