/**
 * AI Configuration Registry
 * Environment-driven configuration for AI providers and models
 *
 * Current setup: OpenAI GPT-5.2 models, Anthropic Claude, xAI Grok, Google Gemini
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
    maxTokensPerDay: parseInt((process.env.AI_DAILY_TOKEN_LIMIT || "500000").trim(), 10),

    // Default chat parameters
    defaultTemperature: 0.7,
    defaultMaxTokens: 2048,

    // Timeouts
    requestTimeoutMs: 60000,
    streamTimeoutMs: 120000,
} as const;

/**
 * Reasoning support tiers:
 * - "explicit": Provider has dedicated reasoning API (e.g., Anthropic extended thinking)
 * - "best_effort": Provider may return reasoning in some responses but not guaranteed
 * - "none": Provider does not support reasoning output
 */
export type ReasoningSupportTier = "explicit" | "best_effort" | "none";

// Available models for user selection
export const USER_SELECTABLE_MODELS = [
    {
        id: "gpt-5.2",
        name: "GPT-5.2",
        description: "Most capable model for complex tasks",
        icon: "auto_awesome",
        provider: "openai",
        reasoningSupport: "best_effort" as ReasoningSupportTier,
    },
    {
        id: "gpt-5-mini",
        name: "GPT-5 Mini",
        description: "Fast and efficient for simpler tasks",
        icon: "bolt",
        provider: "openai",
        reasoningSupport: "none" as ReasoningSupportTier,
    },
    {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        description: "Best writing quality per dollar",
        icon: "edit_note",
        provider: "anthropic",
        reasoningSupport: "explicit" as ReasoningSupportTier,
    },
    {
        id: "grok-4-1-fast",
        name: "Grok 4.1 Fast",
        description: "Fast tool calling, 2M context",
        icon: "rocket_launch",
        provider: "xai",
        reasoningSupport: "best_effort" as ReasoningSupportTier,
    },
    {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        description: "Fast and cheap, 1M context",
        icon: "flash_on",
        provider: "google",
        reasoningSupport: "none" as ReasoningSupportTier,
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
    google: [
        { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", contextWindow: 1048576, capabilities: ["chat", "vision", "tools"] },
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

const DEFAULT_CONTEXT_BUDGET = 80_000;

/** Get the token budget for message history, derived from model context window.
 *  Reserves 40% for system prompt, tool definitions, and response. */
export function getContextBudget(modelId?: string): number {
    if (!modelId) return DEFAULT_CONTEXT_BUDGET;
    for (const models of Object.values(AVAILABLE_MODELS)) {
        const found = models.find(m => m.id === modelId);
        if (found) return Math.floor(found.contextWindow * 0.6);
    }
    return DEFAULT_CONTEXT_BUDGET;
}

/**
 * Get the reasoning support tier for a model.
 * Returns "none" for unknown models (safe default).
 */
export function getReasoningSupportTier(modelId: string): ReasoningSupportTier {
    const model = USER_SELECTABLE_MODELS.find((m) => m.id === modelId);
    return model?.reasoningSupport ?? "none";
}

/**
 * Check if a model supports reasoning output.
 * Returns true for "explicit" and "best_effort" tiers.
 */
export function modelSupportsReasoning(modelId: string): boolean {
    const tier = getReasoningSupportTier(modelId);
    return tier !== "none";
}
