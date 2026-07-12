import "server-only";

import {
    MODEL_CAPABILITY_REGISTRY,
    getModelCapabilityRecord,
    type AIProviderId,
} from "@/lib/ai/config";

export const DEFAULT_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

const GATEWAY_MODEL_ENV_BY_PRODUCT_ID: Readonly<Record<string, string>> = Object.freeze({
    "deepseek-v4-flash": "AI_GATEWAY_DEEPSEEK_V4_FLASH_MODEL",
    "deepseek-v4-pro": "AI_GATEWAY_DEEPSEEK_V4_PRO_MODEL",
    "qwen3.7-plus": "AI_GATEWAY_QWEN37_PLUS_MODEL",
});

export type ModelAvailability = {
    modelId: string;
    provider: AIProviderId;
    providerModelId: string;
    configured: boolean;
    unavailableReason?: "disabled" | "missing_credentials" | "missing_model_route";
};

export type GatewayRuntimeConfig = {
    baseURL: string;
    apiKey?: string;
    providerModelId: string;
    usesVercelGateway: boolean;
    enabled: boolean;
    modelRouteConfigured: boolean;
};

type Environment = Readonly<Record<string, string | undefined>>;

function readNonEmptyEnv(name: string, env: Environment = process.env): string | undefined {
    const value = env[name]?.trim();
    return value || undefined;
}

function configuredForProvider(provider: AIProviderId): boolean {
    switch (provider) {
        case "openai":
            return !!readNonEmptyEnv("OPENAI_API_KEY");
        case "anthropic":
            return !!readNonEmptyEnv("ANTHROPIC_API_KEY");
        case "xai":
            return !!readNonEmptyEnv("XAI_API_KEY");
        case "google":
            return !!readNonEmptyEnv("GEMINI_API_KEY");
        case "gateway":
            return isGatewayEnabled() && hasGatewayCredentials();
    }
}

export function isGatewayEnabled(env: Environment = process.env): boolean {
    return readNonEmptyEnv("AI_MODEL_GATEWAY_ENABLED", env) === "1";
}

export function resolveGatewayApiKey(
    baseURL = resolveGatewayBaseURL(),
    env: Environment = process.env,
): string | undefined {
    const explicitGatewayKey = readNonEmptyEnv("AI_MODEL_GATEWAY_API_KEY", env)
        ?? readNonEmptyEnv("AI_GATEWAY_API_KEY", env);
    if (explicitGatewayKey) return explicitGatewayKey;

    // Vercel OIDC credentials are audience-bound platform credentials. Never
    // forward them to an operator-configured third-party compatible endpoint.
    return baseURL === DEFAULT_AI_GATEWAY_BASE_URL
        ? readNonEmptyEnv("VERCEL_OIDC_TOKEN", env)
        : undefined;
}

export function resolveGatewayBaseURL(env: Environment = process.env): string {
    const configured = readNonEmptyEnv("AI_MODEL_GATEWAY_BASE_URL", env)
        ?? DEFAULT_AI_GATEWAY_BASE_URL;
    return configured.replace(/\/+$/, "");
}

export function hasGatewayCredentials(env: Environment = process.env): boolean {
    const baseURL = resolveGatewayBaseURL(env);
    return !!resolveGatewayApiKey(baseURL, env);
}

function hasExplicitGatewayModelRoute(
    modelId: string,
    env: Environment = process.env,
): boolean {
    const overrideEnv = GATEWAY_MODEL_ENV_BY_PRODUCT_ID[modelId];
    return !!(overrideEnv && readNonEmptyEnv(overrideEnv, env));
}

export function resolveGatewayProviderModelId(
    modelId: string,
    env: Environment = process.env,
): string {
    const model = getModelCapabilityRecord(modelId);
    const overrideEnv = GATEWAY_MODEL_ENV_BY_PRODUCT_ID[modelId];
    return (overrideEnv ? readNonEmptyEnv(overrideEnv, env) : undefined)
        ?? model?.providerModelId
        ?? modelId;
}

export function isGatewayModelConfigured(
    modelId: string,
    env: Environment = process.env,
): boolean {
    if (!isGatewayEnabled(env)) return false;
    const baseURL = resolveGatewayBaseURL(env);
    if (!resolveGatewayApiKey(baseURL, env)) return false;
    return baseURL === DEFAULT_AI_GATEWAY_BASE_URL
        || hasExplicitGatewayModelRoute(modelId, env);
}

export function resolveGatewayRuntimeConfig(modelId: string): GatewayRuntimeConfig {
    const baseURL = resolveGatewayBaseURL();
    const usesVercelGateway = baseURL === DEFAULT_AI_GATEWAY_BASE_URL;
    return {
        baseURL,
        apiKey: resolveGatewayApiKey(baseURL),
        providerModelId: resolveGatewayProviderModelId(modelId),
        usesVercelGateway,
        enabled: isGatewayEnabled(),
        modelRouteConfigured: usesVercelGateway || hasExplicitGatewayModelRoute(modelId),
    };
}

export function getModelAvailability(modelId: string): ModelAvailability | undefined {
    const model = getModelCapabilityRecord(modelId);
    if (!model) return undefined;

    const gatewayRuntime = model.provider === "gateway"
        ? resolveGatewayRuntimeConfig(model.id)
        : null;
    const configured = gatewayRuntime
        ? isGatewayModelConfigured(model.id)
        : configuredForProvider(model.provider);
    const providerModelId = gatewayRuntime?.providerModelId ?? model.providerModelId;
    const unavailableReason = gatewayRuntime && !configured
        ? !gatewayRuntime.enabled
            ? "disabled" as const
            : !gatewayRuntime.apiKey
                ? "missing_credentials" as const
                : "missing_model_route" as const
        : "missing_credentials" as const;
    return {
        modelId: model.id,
        provider: model.provider,
        providerModelId,
        configured,
        ...(configured ? {} : { unavailableReason }),
    };
}

export function getModelAvailabilityMap(): Record<string, ModelAvailability> {
    return Object.fromEntries(
        MODEL_CAPABILITY_REGISTRY.map((model) => [model.id, getModelAvailability(model.id)!]),
    );
}

export function isModelConfigured(modelId: string): boolean {
    return getModelAvailability(modelId)?.configured ?? false;
}
