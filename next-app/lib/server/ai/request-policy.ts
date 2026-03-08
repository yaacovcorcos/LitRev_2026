import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
import {
    AI_CONFIG,
    getModelCapabilityRecord,
    type ModelCapabilityRecord,
    type ReasoningSupportTier,
} from "@/lib/ai/config";
import type { ChatOptions } from "@/types/ai";

type NormalizedProviderChatOptions = ChatOptions & {
    model: string;
    maxTokens: number;
    temperature?: number;
    includeReasoning: boolean;
    reasoningBudgetTokens?: number;
};

function createModelCapabilityError(params: {
    model: string;
    code: "UNSUPPORTED_REASONING_CAPABILITY";
    message: string;
}): AIErrorWithEnvelope {
    return new AIErrorWithEnvelope({
        kind: "model_capability",
        code: params.code,
        retryable: false,
        source: "request_policy",
        message: params.message,
    });
}

function normalizeTemperature(
    model: ModelCapabilityRecord,
    requestedTemperature: number | undefined,
): number | undefined {
    if (model.temperatureSupport === "fixed_default_only") {
        return undefined;
    }
    return requestedTemperature ?? AI_CONFIG.defaultTemperature;
}

function normalizeReasoning(params: {
    model: ModelCapabilityRecord;
    includeReasoning?: boolean;
    reasoningBudgetTokens?: number;
}): Pick<NormalizedProviderChatOptions, "includeReasoning" | "reasoningBudgetTokens"> {
    const tier: ReasoningSupportTier = params.model.reasoningSupport;
    const wantsReasoning = !!params.includeReasoning;

    if (tier === "explicit") {
        return {
            includeReasoning: wantsReasoning,
            reasoningBudgetTokens: wantsReasoning ? params.reasoningBudgetTokens : undefined,
        };
    }

    if (params.reasoningBudgetTokens !== undefined) {
        throw createModelCapabilityError({
            model: params.model.name,
            code: "UNSUPPORTED_REASONING_CAPABILITY",
            message: `${params.model.name} does not support an explicit reasoning budget.`,
        });
    }

    if (tier === "best_effort") {
        return {
            includeReasoning: wantsReasoning,
            reasoningBudgetTokens: undefined,
        };
    }

    return {
        includeReasoning: false,
        reasoningBudgetTokens: undefined,
    };
}

export function normalizeChatOptionsForModel(options: ChatOptions = {}): NormalizedProviderChatOptions {
    const model = options.model || AI_CONFIG.defaultModel;
    const capabilityRecord = getModelCapabilityRecord(model);
    if (!capabilityRecord) {
        return {
            ...options,
            model,
            maxTokens: options.maxTokens ?? AI_CONFIG.defaultMaxTokens,
            temperature: options.temperature ?? AI_CONFIG.defaultTemperature,
            includeReasoning: !!options.includeReasoning,
            reasoningBudgetTokens: options.includeReasoning ? options.reasoningBudgetTokens : undefined,
        };
    }

    const reasoning = normalizeReasoning({
        model: capabilityRecord,
        includeReasoning: options.includeReasoning,
        reasoningBudgetTokens: options.reasoningBudgetTokens,
    });

    return {
        ...options,
        model,
        maxTokens: options.maxTokens ?? AI_CONFIG.defaultMaxTokens,
        temperature: normalizeTemperature(capabilityRecord, options.temperature),
        includeReasoning: reasoning.includeReasoning,
        reasoningBudgetTokens: reasoning.reasoningBudgetTokens,
    };
}
