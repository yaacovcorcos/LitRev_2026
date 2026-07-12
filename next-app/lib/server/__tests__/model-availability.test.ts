import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_AI_GATEWAY_BASE_URL,
    getModelAvailabilityMap,
    isModelConfigured,
    resolveGatewayRuntimeConfig,
} from "@/lib/server/ai/model-availability";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("model availability", () => {
    it("reports each model from live server credential state", () => {
        vi.stubEnv("OPENAI_API_KEY", "openai-key");
        vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "1");
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "");
        vi.stubEnv("AI_GATEWAY_API_KEY", "");
        vi.stubEnv("VERCEL_OIDC_TOKEN", "");

        const availability = getModelAvailabilityMap();

        expect(availability["gpt-5.6-luna"]).toMatchObject({
            provider: "openai",
            configured: true,
        });
        expect(availability["deepseek-v4-pro"]).toMatchObject({
            provider: "gateway",
            configured: false,
            unavailableReason: "missing_credentials",
        });
    });

    it("accepts Vercel OIDC and uses the official gateway default", () => {
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "");
        vi.stubEnv("AI_GATEWAY_API_KEY", "");
        vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "");
        vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "1");

        expect(isModelConfigured("qwen3.7-plus")).toBe(true);
        expect(resolveGatewayRuntimeConfig("qwen3.7-plus")).toMatchObject({
            baseURL: DEFAULT_AI_GATEWAY_BASE_URL,
            providerModelId: "alibaba/qwen3.7-plus",
            usesVercelGateway: true,
        });
    });

    it("resolves base URL, key, and upstream slug overrides without changing product IDs", () => {
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "custom-key");
        vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "1");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "https://gateway.example/v1/");
        vi.stubEnv("AI_GATEWAY_DEEPSEEK_V4_FLASH_MODEL", "custom/deepseek-flash");

        const availability = getModelAvailabilityMap();
        const runtime = resolveGatewayRuntimeConfig("deepseek-v4-flash");

        expect(availability["deepseek-v4-flash"]).toMatchObject({
            modelId: "deepseek-v4-flash",
            providerModelId: "custom/deepseek-flash",
            configured: true,
        });
        expect(runtime).toMatchObject({
            baseURL: "https://gateway.example/v1",
            providerModelId: "custom/deepseek-flash",
            usesVercelGateway: false,
        });
    });

    it("never forwards a Vercel OIDC token to a custom gateway base URL", () => {
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "");
        vi.stubEnv("AI_GATEWAY_API_KEY", "");
        vi.stubEnv("VERCEL_OIDC_TOKEN", "vercel-oidc-token");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "https://third-party.example/v1");
        vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "1");

        expect(resolveGatewayRuntimeConfig("deepseek-v4-pro")).toMatchObject({
            baseURL: "https://third-party.example/v1",
            apiKey: undefined,
            usesVercelGateway: false,
        });
        expect(isModelConfigured("deepseek-v4-pro")).toBe(false);
    });

    it("keeps automatic Vercel OIDC staged until the rollout gate is enabled", () => {
        vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "0");
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "");
        vi.stubEnv("AI_GATEWAY_API_KEY", "");
        vi.stubEnv("VERCEL_OIDC_TOKEN", "vercel-oidc-token");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "");

        expect(isModelConfigured("deepseek-v4-pro")).toBe(false);
        expect(getModelAvailabilityMap()["deepseek-v4-pro"]?.unavailableReason).toBe("disabled");
    });

    it("requires an explicit per-model route for custom gateway bases", () => {
        vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "1");
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "custom-key");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "https://api.deepseek.com");
        vi.stubEnv("AI_GATEWAY_DEEPSEEK_V4_PRO_MODEL", "");
        vi.stubEnv("AI_GATEWAY_QWEN37_PLUS_MODEL", "");

        expect(isModelConfigured("deepseek-v4-pro")).toBe(false);
        expect(isModelConfigured("qwen3.7-plus")).toBe(false);

        vi.stubEnv("AI_GATEWAY_DEEPSEEK_V4_PRO_MODEL", "deepseek-v4-pro");
        expect(isModelConfigured("deepseek-v4-pro")).toBe(true);
        expect(isModelConfigured("qwen3.7-plus")).toBe(false);
    });

    it("returns false for unknown product IDs", () => {
        expect(isModelConfigured("unknown-model")).toBe(false);
    });
});
