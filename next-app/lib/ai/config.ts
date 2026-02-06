/**
 * AI Configuration Registry
 * Environment-driven configuration for AI providers and models
 *
 * Current setup: OpenAI GPT-5.2 models, Anthropic Claude, xAI Grok
 * Token usage is tracked accurately via streaming API
 */

export const AI_CONFIG = {
    // Provider settings (trim to handle any whitespace/newlines in env vars)
    defaultProvider: (process.env.AI_DEFAULT_PROVIDER || "openai").trim(),

    // Model settings
    defaultModel: (process.env.AI_DEFAULT_MODEL || "gpt-5.2").trim(),
    reasoningModel: (process.env.AI_REASONING_MODEL || "gpt-5.2").trim(),

    // Rate limiting
    maxRequestsPerMinute: parseInt((process.env.AI_RATE_LIMIT || "20").trim(), 10),
    maxTokensPerDay: parseInt((process.env.AI_DAILY_TOKEN_LIMIT || "100000").trim(), 10),

    // Default chat parameters
    defaultTemperature: 0.7,
    defaultMaxTokens: 2048,

    // Timeouts
    requestTimeoutMs: 60000,
    streamTimeoutMs: 120000,
} as const;

// Available models for user selection
export const USER_SELECTABLE_MODELS = [
    {
        id: "gpt-5.2",
        name: "GPT-5.2",
        description: "Most capable model for complex tasks",
        icon: "auto_awesome",
        provider: "openai",
    },
    {
        id: "gpt-5-mini",
        name: "GPT-5 Mini",
        description: "Fast and efficient for simpler tasks",
        icon: "bolt",
        provider: "openai",
    },
    {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        description: "Best writing quality per dollar",
        icon: "edit_note",
        provider: "anthropic",
    },
    {
        id: "grok-4-1-fast",
        name: "Grok 4.1 Fast",
        description: "Fast tool calling, 2M context",
        icon: "rocket_launch",
        provider: "xai",
    },
] as const;

export type SelectableModelId = typeof USER_SELECTABLE_MODELS[number]["id"];

// Full models registry (internal use)
export const AVAILABLE_MODELS = {
    openai: [
        { id: "gpt-5.2", name: "GPT-5.2", contextWindow: 128000, capabilities: ["chat", "vision", "tools"] },
        { id: "gpt-5-mini", name: "GPT-5 Mini", contextWindow: 128000, capabilities: ["chat", "vision", "tools"] },
        { id: "gpt-5-nano", name: "GPT-5 Nano", contextWindow: 128000, capabilities: ["chat", "tools"] },
        { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, capabilities: ["chat", "vision", "tools"] },
        { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, capabilities: ["chat", "vision", "tools"] },
    ],
    anthropic: [
        { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200000, capabilities: ["chat", "vision", "tools"] },
    ],
    xai: [
        { id: "grok-4-1-fast", name: "Grok 4.1 Fast", contextWindow: 2000000, capabilities: ["chat", "tools"] },
    ],
} as const;

/** Look up which provider owns a given model ID */
export function getProviderForModel(modelId: string): string | undefined {
    for (const entry of USER_SELECTABLE_MODELS) {
        if (entry.id === modelId) return entry.provider;
    }
    for (const [provider, models] of Object.entries(AVAILABLE_MODELS)) {
        if (models.some(m => m.id === modelId)) return provider;
    }
    return undefined;
}
