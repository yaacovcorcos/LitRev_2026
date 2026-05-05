/**
 * AI Configuration Registry
 * Environment-driven configuration for AI providers and models.
 *
 * The per-model registry in this file is authoritative for:
 * - provider ownership
 * - UI model selection metadata
 * - runtime context window metadata
 * - request-boundary capability policy
 */

export const DEFAULT_SELECTABLE_MODEL_ID = "grok-4-1-fast" as const;
export const DEFAULT_REASONING_MODEL_ID = "gpt-5.2" as const;

export type ReasoningSupportTier = "explicit" | "best_effort" | "none";
export type TemperatureSupportTier = "full" | "fixed_default_only";

type ModelCapability = "chat" | "vision" | "tools" | "web-search";

export type ModelCapabilityRecord = {
    id: string;
    name: string;
    provider: "openai" | "anthropic" | "xai" | "google";
    contextWindow: number;
    capabilities: ModelCapability[];
    reasoningSupport: ReasoningSupportTier;
    temperatureSupport: TemperatureSupportTier;
    selectable: boolean;
    ui?: {
        description: string;
        icon: string;
    };
};

export const MODEL_CAPABILITY_REGISTRY = [
    {
        id: "gpt-5.2",
        name: "GPT-5.2",
        provider: "openai",
        contextWindow: 128000,
        capabilities: ["chat", "vision", "tools"],
        reasoningSupport: "best_effort",
        temperatureSupport: "fixed_default_only",
        selectable: true,
        ui: {
            description: "Most capable model for complex tasks",
            icon: "auto_awesome",
        },
    },
    {
        id: "gpt-5-mini",
        name: "GPT-5 Mini",
        provider: "openai",
        contextWindow: 128000,
        capabilities: ["chat", "vision", "tools"],
        reasoningSupport: "none",
        temperatureSupport: "fixed_default_only",
        selectable: false,
        ui: {
            description: "Fast and efficient for simpler tasks",
            icon: "bolt",
        },
    },
    {
        id: "gpt-5-nano",
        name: "GPT-5 Nano",
        provider: "openai",
        contextWindow: 128000,
        capabilities: ["chat", "tools"],
        reasoningSupport: "none",
        temperatureSupport: "fixed_default_only",
        selectable: false,
    },
    {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        contextWindow: 128000,
        capabilities: ["chat", "vision", "tools"],
        reasoningSupport: "none",
        temperatureSupport: "full",
        selectable: false,
    },
    {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "openai",
        contextWindow: 128000,
        capabilities: ["chat", "vision", "tools"],
        reasoningSupport: "none",
        temperatureSupport: "full",
        selectable: false,
    },
    {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        provider: "anthropic",
        contextWindow: 200000,
        capabilities: ["chat", "vision", "tools"],
        reasoningSupport: "explicit",
        temperatureSupport: "full",
        selectable: false,
        ui: {
            description: "Best writing quality per dollar",
            icon: "edit_note",
        },
    },
    {
        id: "grok-4-1-fast",
        name: "Grok 4.1 Fast",
        provider: "xai",
        contextWindow: 2000000,
        capabilities: ["chat", "tools"],
        reasoningSupport: "best_effort",
        temperatureSupport: "full",
        selectable: true,
        ui: {
            description: "Fast tool calling, 2M context",
            icon: "rocket_launch",
        },
    },
    {
        id: "grok-4.3",
        name: "Grok 4.3",
        provider: "xai",
        contextWindow: 1000000,
        capabilities: ["chat", "vision", "tools"],
        reasoningSupport: "best_effort",
        temperatureSupport: "full",
        selectable: true,
        ui: {
            description: "Flagship xAI reasoning, 1M context",
            icon: "psychology",
        },
    },
    {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        provider: "google",
        contextWindow: 1048576,
        capabilities: ["chat", "vision", "tools"],
        reasoningSupport: "none",
        temperatureSupport: "full",
        selectable: false,
        ui: {
            description: "Fast and cheap, 1M context",
            icon: "flash_on",
        },
    },
] as const satisfies readonly ModelCapabilityRecord[];

export const USER_SELECTABLE_MODELS = MODEL_CAPABILITY_REGISTRY
    .filter((model) => model.selectable)
    .map((model) => ({
        id: model.id,
        name: model.name,
        description: model.ui?.description ?? "",
        icon: model.ui?.icon ?? "smart_toy",
        provider: model.provider,
        reasoningSupport: model.reasoningSupport,
    }));

export type SelectableModelId = typeof USER_SELECTABLE_MODELS[number]["id"];

export const AVAILABLE_MODELS = Object.freeze({
    openai: MODEL_CAPABILITY_REGISTRY
        .filter((model) => model.provider === "openai")
        .map((model) => ({
            id: model.id,
            name: model.name,
            contextWindow: model.contextWindow,
            capabilities: [...model.capabilities],
        })),
    anthropic: MODEL_CAPABILITY_REGISTRY
        .filter((model) => model.provider === "anthropic")
        .map((model) => ({
            id: model.id,
            name: model.name,
            contextWindow: model.contextWindow,
            capabilities: [...model.capabilities],
        })),
    xai: MODEL_CAPABILITY_REGISTRY
        .filter((model) => model.provider === "xai")
        .map((model) => ({
            id: model.id,
            name: model.name,
            contextWindow: model.contextWindow,
            capabilities: [...model.capabilities],
        })),
    google: MODEL_CAPABILITY_REGISTRY
        .filter((model) => model.provider === "google")
        .map((model) => ({
            id: model.id,
            name: model.name,
            contextWindow: model.contextWindow,
            capabilities: [...model.capabilities],
        })),
});

export function getModelCapabilityRecord(modelId: string): ModelCapabilityRecord | undefined {
    return MODEL_CAPABILITY_REGISTRY.find((model) => model.id === modelId);
}

export function getProviderForModel(modelId: string): string | undefined {
    return getModelCapabilityRecord(modelId)?.provider;
}

const runtimeDefaultModel = (process.env.AI_DEFAULT_MODEL || DEFAULT_SELECTABLE_MODEL_ID).trim();

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

export function modelSupportsReasoning(modelId: string): boolean {
    return getReasoningSupportTier(modelId) !== "none";
}
