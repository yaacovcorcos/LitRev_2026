/**
 * AI Configuration Registry
 * Environment-driven configuration for AI providers and models
 *
 * Current setup: OpenAI GPT-5.2 models
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
        icon: "auto_awesome"
    },
    {
        id: "gpt-5.2-mini",
        name: "GPT-5.2 Mini",
        description: "Fast and efficient for simpler tasks",
        icon: "bolt"
    },
] as const;

export type SelectableModelId = typeof USER_SELECTABLE_MODELS[number]["id"];

// Full models registry (internal use)
export const AVAILABLE_MODELS = {
    openai: [
        { id: "gpt-5.2", name: "GPT-5.2", contextWindow: 128000, capabilities: ["chat", "vision", "tools"] },
        { id: "gpt-5.2-mini", name: "GPT-5.2 Mini", contextWindow: 128000, capabilities: ["chat", "vision", "tools"] },
        { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, capabilities: ["chat", "vision", "tools"] },
        { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, capabilities: ["chat", "vision", "tools"] },
    ],
} as const;
