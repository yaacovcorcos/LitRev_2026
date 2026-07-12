/**
 * AI model portfolio and capability registry.
 *
 * Product model IDs are stable application contracts. Provider model IDs are
 * routing details and may be overridden server-side without changing saved
 * user preferences or UI copy.
 */

import type { DeliveryMode, ReasoningEffort } from "@/types/ai";

export const DEFAULT_SELECTABLE_MODEL_ID = "gpt-5.6-luna" as const;
export const DEFAULT_REASONING_MODEL_ID = DEFAULT_SELECTABLE_MODEL_ID;

export const SELECTABLE_MODEL_IDS = [
    "deepseek-v4-flash",
    "gpt-5.6-luna",
    "deepseek-v4-pro",
    "gpt-5.6-terra",
    "qwen3.7-plus",
    "grok-4.5",
    "gpt-5.6-sol",
] as const;

export type SelectableModelId = typeof SELECTABLE_MODEL_IDS[number];
export type AIProviderId = "openai" | "anthropic" | "xai" | "google" | "gateway";
export type ProviderDialect = "openai" | "anthropic" | "xai" | "google" | "deepseek" | "qwen";
export type ReasoningSupportTier = "explicit" | "best_effort" | "none";
export type ReasoningVisibilitySupport = "none" | "summary" | "full";
export type TemperatureSupportTier = "full" | "fixed_default_only";
export type ModelCapability = "chat" | "vision" | "tools" | "web-search" | "file-input";
export type ModelCostClass = "lowest" | "value" | "standard" | "advanced" | "premium";

export type ModelPricing = {
    currency: "USD";
    asOf: string;
    /** USD per one million tokens. */
    inputPerMillion: number;
    cachedInputPerMillion?: number;
    cacheWriteInputPerMillion?: number;
    outputPerMillion: number;
    /** Aggregate 500k input + 50k output across calls below long-context tiers. */
    standardizedLargeTaskUsd: number;
    note?: string;
};

export type ModelCapabilityRecord = {
    id: string;
    providerModelId: string;
    name: string;
    shortName: string;
    provider: AIProviderId;
    providerDialect: ProviderDialect;
    contextWindow: number;
    maxOutputTokens: number;
    capabilities: readonly ModelCapability[];
    reasoningSupport: ReasoningSupportTier;
    reasoningVisibilitySupport: ReasoningVisibilitySupport;
    reasoningEfforts: readonly ReasoningEffort[];
    defaultReasoningEffort: ReasoningEffort;
    temperatureSupport: TemperatureSupportTier;
    deliveryModes: readonly DeliveryMode[];
    selectable: boolean;
    costClass?: ModelCostClass;
    pricing?: ModelPricing;
    ui?: {
        role: string;
        badge: string;
        description: string;
        whenToChoose: string;
        icon: string;
        premium?: boolean;
        priorityPriceNote?: string;
    };
};

const PRICE_DATE = "2026-07-12";

export const MODEL_CAPABILITY_REGISTRY = [
    {
        id: "deepseek-v4-flash",
        providerModelId: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        shortName: "Flash",
        provider: "gateway",
        providerDialect: "deepseek",
        contextWindow: 1_000_000,
        maxOutputTokens: 384_000,
        capabilities: ["chat", "tools"],
        reasoningSupport: "explicit",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast", "high", "max"],
        defaultReasoningEffort: "fast",
        temperatureSupport: "full",
        deliveryModes: ["standard"],
        selectable: true,
        costClass: "lowest",
        pricing: {
            currency: "USD",
            asOf: PRICE_DATE,
            inputPerMillion: 0.14,
            cachedInputPerMillion: 0.028,
            outputPerMillion: 0.28,
            standardizedLargeTaskUsd: 0.084,
            note: "Creator-first Vercel route; a fallback host may use different cache pricing.",
        },
        ui: {
            role: "Fast & Cheapest",
            badge: "Lowest cost",
            description: "Fastest and cheapest · summaries, rewrites and extraction.",
            whenToChoose: "Choose for quick coding chores, classification, extraction and inexpensive background work.",
            icon: "bolt",
        },
    },
    {
        id: "gpt-5.6-luna",
        providerModelId: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        shortName: "Luna",
        provider: "openai",
        providerDialect: "openai",
        contextWindow: 1_050_000,
        maxOutputTokens: 128_000,
        capabilities: ["chat", "vision", "tools", "web-search", "file-input"],
        reasoningSupport: "explicit",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast", "low", "medium", "high", "max"],
        defaultReasoningEffort: "medium",
        temperatureSupport: "fixed_default_only",
        deliveryModes: ["standard", "priority"],
        selectable: true,
        costClass: "standard",
        pricing: {
            currency: "USD",
            asOf: PRICE_DATE,
            inputPerMillion: 1,
            cachedInputPerMillion: 0.1,
            cacheWriteInputPerMillion: 1.25,
            outputPerMillion: 6,
            standardizedLargeTaskUsd: 0.8,
            note: "Cache writes cost 1.25× ordinary input; requests above 272k tokens use OpenAI's long-context multiplier.",
        },
        ui: {
            role: "Default",
            badge: "Default",
            description: "Best everyday choice · research, writing and tools.",
            whenToChoose: "Choose for most research, writing, coding and agent work.",
            icon: "auto_awesome",
            priorityPriceNote: "Faster delivery uses OpenAI priority processing and may cost more.",
        },
    },
    {
        id: "deepseek-v4-pro",
        providerModelId: "deepseek/deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        shortName: "V4 Pro",
        provider: "gateway",
        providerDialect: "deepseek",
        contextWindow: 1_000_000,
        maxOutputTokens: 384_000,
        capabilities: ["chat", "tools"],
        reasoningSupport: "explicit",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast", "high", "max"],
        defaultReasoningEffort: "high",
        temperatureSupport: "full",
        deliveryModes: ["standard"],
        selectable: true,
        costClass: "value",
        pricing: {
            currency: "USD",
            asOf: PRICE_DATE,
            inputPerMillion: 0.435,
            cachedInputPerMillion: 0.0036,
            outputPerMillion: 0.87,
            standardizedLargeTaskUsd: 0.261,
            note: "Creator-first Vercel route; fallback host token prices can be higher.",
        },
        ui: {
            role: "Science Value",
            badge: "Best value",
            description: "Strong reasoning · large scientific and coding tasks.",
            whenToChoose: "Choose for serious coding, high-volume scientific analysis and long tool-driven jobs.",
            icon: "science",
        },
    },
    {
        id: "gpt-5.6-terra",
        providerModelId: "gpt-5.6-terra",
        name: "GPT-5.6 Terra",
        shortName: "Terra",
        provider: "openai",
        providerDialect: "openai",
        contextWindow: 1_050_000,
        maxOutputTokens: 128_000,
        capabilities: ["chat", "vision", "tools", "web-search", "file-input"],
        reasoningSupport: "explicit",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast", "low", "medium", "high", "max"],
        defaultReasoningEffort: "medium",
        temperatureSupport: "fixed_default_only",
        deliveryModes: ["standard", "priority"],
        selectable: true,
        costClass: "advanced",
        pricing: {
            currency: "USD",
            asOf: PRICE_DATE,
            inputPerMillion: 2.5,
            cachedInputPerMillion: 0.25,
            cacheWriteInputPerMillion: 3.125,
            outputPerMillion: 15,
            standardizedLargeTaskUsd: 2,
            note: "Cache writes cost 1.25× ordinary input; requests above 272k tokens use OpenAI's long-context multiplier.",
        },
        ui: {
            role: "Advanced Research",
            badge: "Advanced research",
            description: "Stronger science and long-context work than Luna.",
            whenToChoose: "Choose when Luna is not enough for difficult synthesis, evidence review or long-context reasoning.",
            icon: "biotech",
            priorityPriceNote: "Faster delivery uses OpenAI priority processing and may cost more.",
        },
    },
    {
        id: "qwen3.7-plus",
        providerModelId: "alibaba/qwen3.7-plus",
        name: "Qwen 3.7 Plus",
        shortName: "Qwen Plus",
        provider: "gateway",
        providerDialect: "qwen",
        contextWindow: 1_000_000,
        maxOutputTokens: 64_000,
        capabilities: ["chat", "vision", "tools", "file-input"],
        reasoningSupport: "explicit",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast", "high", "max"],
        defaultReasoningEffort: "high",
        temperatureSupport: "full",
        deliveryModes: ["standard"],
        selectable: true,
        costClass: "value",
        pricing: {
            currency: "USD",
            asOf: PRICE_DATE,
            inputPerMillion: 0.4,
            cachedInputPerMillion: 0.08,
            cacheWriteInputPerMillion: 0.5,
            outputPerMillion: 1.6,
            standardizedLargeTaskUsd: 0.28,
            note: "Creator-first Vercel route; requests above 256k tokens use higher tiers and fallback host prices can differ.",
        },
        ui: {
            role: "Vision & Documents",
            badge: "Vision & documents",
            description: "Figures, tables, scans and visually complex documents.",
            whenToChoose: "Choose for screenshots, document figures, tables and long multimodal material.",
            icon: "document_scanner",
        },
    },
    {
        id: "grok-4.5",
        providerModelId: "grok-4.5",
        name: "Grok 4.5",
        shortName: "Grok 4.5",
        provider: "xai",
        providerDialect: "xai",
        contextWindow: 500_000,
        maxOutputTokens: 500_000,
        capabilities: ["chat", "vision", "tools", "web-search", "file-input"],
        reasoningSupport: "explicit",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast", "medium", "high"],
        defaultReasoningEffort: "medium",
        temperatureSupport: "fixed_default_only",
        deliveryModes: ["standard", "priority"],
        selectable: true,
        costClass: "advanced",
        pricing: {
            currency: "USD",
            asOf: PRICE_DATE,
            inputPerMillion: 2,
            cachedInputPerMillion: 0.5,
            outputPerMillion: 6,
            standardizedLargeTaskUsd: 1.3,
            note: "Direct xAI rates are 2× above 200k input tokens; confirmed priority processing adds another 2× token-price multiplier.",
        },
        ui: {
            role: "Strong Agent",
            badge: "Strong agent",
            description: "Complex tools, coding and difficult multi-step work.",
            whenToChoose: "Choose for agentic coding, complex tool orchestration and a strong alternative perspective.",
            icon: "psychology",
            priorityPriceNote: "Faster delivery is xAI priority processing at 2× token price.",
        },
    },
    {
        id: "gpt-5.6-sol",
        providerModelId: "gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        shortName: "Sol",
        provider: "openai",
        providerDialect: "openai",
        contextWindow: 1_050_000,
        maxOutputTokens: 128_000,
        capabilities: ["chat", "vision", "tools", "web-search", "file-input"],
        reasoningSupport: "explicit",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast", "low", "medium", "high", "max"],
        defaultReasoningEffort: "medium",
        temperatureSupport: "fixed_default_only",
        deliveryModes: ["standard", "priority"],
        selectable: true,
        costClass: "premium",
        pricing: {
            currency: "USD",
            asOf: PRICE_DATE,
            inputPerMillion: 5,
            cachedInputPerMillion: 0.5,
            cacheWriteInputPerMillion: 6.25,
            outputPerMillion: 30,
            standardizedLargeTaskUsd: 4,
            note: "Cache writes cost 1.25× ordinary input; requests above 272k tokens use OpenAI's long-context multiplier.",
        },
        ui: {
            role: "Premium",
            badge: "Premium",
            description: "Highest capability · reserve for the hardest synthesis.",
            whenToChoose: "Choose only when accuracy matters more than cost and cheaper models are insufficient.",
            icon: "workspace_premium",
            premium: true,
            priorityPriceNote: "Faster delivery uses OpenAI priority processing and may cost more.",
        },
    },
    // Non-selectable adapters retained for backwards-compatible operator routes.
    {
        id: "claude-haiku-4-5",
        providerModelId: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        shortName: "Haiku",
        provider: "anthropic",
        providerDialect: "anthropic",
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        capabilities: ["chat", "vision", "tools"],
        reasoningSupport: "explicit",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast", "high"],
        defaultReasoningEffort: "fast",
        temperatureSupport: "full",
        deliveryModes: ["standard"],
        selectable: false,
    },
    {
        id: "gemini-3-flash-preview",
        providerModelId: "gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        shortName: "Gemini Flash",
        provider: "google",
        providerDialect: "google",
        contextWindow: 1_048_576,
        maxOutputTokens: 65_536,
        capabilities: ["chat", "vision", "tools"],
        reasoningSupport: "none",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast"],
        defaultReasoningEffort: "fast",
        temperatureSupport: "full",
        deliveryModes: ["standard"],
        selectable: false,
    },
] as const satisfies readonly ModelCapabilityRecord[];

export const USER_SELECTABLE_MODELS = SELECTABLE_MODEL_IDS.map((id) => {
    const model = MODEL_CAPABILITY_REGISTRY.find((candidate) => candidate.id === id);
    if (!model || !model.selectable || !model.ui || !model.pricing || !model.costClass) {
        throw new Error(`Selectable model registry entry is incomplete: ${id}`);
    }
    const typedModel: ModelCapabilityRecord = model;
    return {
        id,
        name: typedModel.name,
        shortName: typedModel.shortName,
        role: typedModel.ui!.role,
        badge: typedModel.ui!.badge,
        description: typedModel.ui!.description,
        whenToChoose: typedModel.ui!.whenToChoose,
        icon: typedModel.ui!.icon,
        provider: typedModel.provider,
        reasoningSupport: typedModel.reasoningSupport,
        reasoningVisibilitySupport: typedModel.reasoningVisibilitySupport,
        reasoningEfforts: [...typedModel.reasoningEfforts],
        defaultReasoningEffort: typedModel.defaultReasoningEffort,
        deliveryModes: [...typedModel.deliveryModes],
        costClass: typedModel.costClass!,
        pricing: typedModel.pricing!,
        premium: typedModel.ui!.premium ?? false,
        priorityPriceNote: typedModel.ui!.priorityPriceNote,
    };
});

const modelsForProvider = (provider: AIProviderId) => MODEL_CAPABILITY_REGISTRY
    .filter((model) => model.provider === provider)
    .map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        capabilities: [...model.capabilities],
    }));

export const AVAILABLE_MODELS = Object.freeze({
    openai: modelsForProvider("openai"),
    anthropic: modelsForProvider("anthropic"),
    xai: modelsForProvider("xai"),
    google: modelsForProvider("google"),
    gateway: modelsForProvider("gateway"),
});

export function getModelCapabilityRecord(modelId: string): ModelCapabilityRecord | undefined {
    return MODEL_CAPABILITY_REGISTRY.find((model) => model.id === modelId);
}

export function isSelectableModelId(modelId: string): modelId is SelectableModelId {
    return (SELECTABLE_MODEL_IDS as readonly string[]).includes(modelId);
}

export function getProviderForModel(modelId: string): AIProviderId | undefined {
    return getModelCapabilityRecord(modelId)?.provider;
}

export function getProviderModelId(modelId: string): string | undefined {
    return getModelCapabilityRecord(modelId)?.providerModelId;
}

export function getDefaultReasoningEffort(modelId: string): ReasoningEffort {
    return getModelCapabilityRecord(modelId)?.defaultReasoningEffort ?? "medium";
}

export function getSupportedReasoningEfforts(modelId: string): readonly ReasoningEffort[] {
    return getModelCapabilityRecord(modelId)?.reasoningEfforts ?? [];
}

export function modelSupportsDeliveryMode(modelId: string, mode: DeliveryMode): boolean {
    return getModelCapabilityRecord(modelId)?.deliveryModes.includes(mode) ?? false;
}

const configuredRuntimeDefault = (process.env.AI_DEFAULT_MODEL || DEFAULT_SELECTABLE_MODEL_ID).trim();
const runtimeDefaultModel = isSelectableModelId(configuredRuntimeDefault)
    ? configuredRuntimeDefault
    : DEFAULT_SELECTABLE_MODEL_ID;

export const AI_CONFIG = {
    defaultProvider: (process.env.AI_DEFAULT_PROVIDER || getProviderForModel(runtimeDefaultModel) || "openai").trim(),
    defaultModel: runtimeDefaultModel,
    reasoningModel: (process.env.AI_REASONING_MODEL || DEFAULT_REASONING_MODEL_ID).trim(),
    maxRequestsPerMinute: parseInt((process.env.AI_RATE_LIMIT || "20").trim(), 10),
    maxTokensPerDay: parseInt((process.env.AI_DAILY_TOKEN_LIMIT || "500000").trim(), 10),
    maxTranscriptionsPerDay: parseInt((process.env.AI_TRANSCRIPTION_DAILY_LIMIT || "100").trim(), 10),
    defaultTemperature: 0.7,
    defaultMaxTokens: 2048,
    requestTimeoutMs: 60000,
    streamTimeoutMs: 120000,
} as const;

const DEFAULT_CONTEXT_BUDGET = 80_000;

export function getContextBudget(modelId?: string): number {
    const found = modelId ? getModelCapabilityRecord(modelId) : undefined;
    if (!found) return DEFAULT_CONTEXT_BUDGET;
    return Math.floor(found.contextWindow * 0.6);
}

export function getReasoningSupportTier(modelId: string): ReasoningSupportTier {
    return getModelCapabilityRecord(modelId)?.reasoningSupport ?? "none";
}

export function getReasoningVisibilitySupport(modelId: string): ReasoningVisibilitySupport {
    return getModelCapabilityRecord(modelId)?.reasoningVisibilitySupport ?? "none";
}

export function modelSupportsReasoning(modelId: string): boolean {
    return getReasoningSupportTier(modelId) !== "none";
}
