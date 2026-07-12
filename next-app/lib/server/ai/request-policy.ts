import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
import {
    AI_CONFIG,
    getModelCapabilityRecord,
    type ModelCapabilityRecord,
    type ProviderDialect,
    type ReasoningSupportTier,
} from "@/lib/ai/config";
import type { ChatOptions, DeliveryMode, ReasoningEffort } from "@/types/ai";
import {
    getDefaultCompletionTokens,
    getDefaultProviderReasoningBudget,
} from "./generation-budget-policy";

export type NormalizedProviderChatOptions = ChatOptions & {
    /** Stable application model ID. */
    model: string;
    /** Concrete upstream route/model ID. */
    providerModelId: string;
    providerDialect: ProviderDialect;
    maxTokens: number;
    temperature?: number;
    includeReasoning: boolean;
    reasoningBudgetTokens?: number;
    reasoningEffort: ReasoningEffort;
    deliveryMode: DeliveryMode;
};

function createModelCapabilityError(params: {
    code: string;
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

function normalizeReasoningVisibility(params: {
    model: ModelCapabilityRecord;
    includeReasoning?: boolean;
    reasoningBudgetTokens?: number;
}): Pick<NormalizedProviderChatOptions, "includeReasoning" | "reasoningBudgetTokens"> {
    const tier: ReasoningSupportTier = params.model.reasoningSupport;
    const wantsVisibleReasoning = params.model.reasoningVisibilitySupport !== "none"
        && !!params.includeReasoning;

    if (tier === "explicit") {
        return {
            includeReasoning: wantsVisibleReasoning,
            // A compute budget is independent from whether reasoning is shown.
            reasoningBudgetTokens: params.reasoningBudgetTokens,
        };
    }

    if (params.reasoningBudgetTokens !== undefined) {
        throw createModelCapabilityError({
            code: "UNSUPPORTED_REASONING_CAPABILITY",
            message: `${params.model.name} does not support an explicit reasoning budget.`,
        });
    }

    if (tier === "best_effort") {
        return {
            includeReasoning: wantsVisibleReasoning,
            reasoningBudgetTokens: undefined,
        };
    }

    return {
        includeReasoning: false,
        reasoningBudgetTokens: undefined,
    };
}

function normalizeReasoningEffort(
    model: ModelCapabilityRecord,
    requestedEffort: ReasoningEffort | undefined,
): ReasoningEffort {
    const effort = requestedEffort ?? model.defaultReasoningEffort;
    if (!model.reasoningEfforts.includes(effort)) {
        throw createModelCapabilityError({
            code: "UNSUPPORTED_REASONING_CAPABILITY",
            message: `${model.name} does not support the ${effort} reasoning intensity.`,
        });
    }
    return effort;
}

function normalizeDeliveryMode(
    model: ModelCapabilityRecord,
    requestedMode: DeliveryMode | undefined,
): DeliveryMode {
    const mode = requestedMode ?? "standard";
    if (!model.deliveryModes.includes(mode)) {
        throw createModelCapabilityError({
            code: "UNSUPPORTED_DELIVERY_MODE",
            message: `${model.name} does not support ${mode} delivery.`,
        });
    }
    return mode;
}

function validatePositiveIntegerBudget(params: {
    field: "maxTokens" | "reasoningBudgetTokens";
    value: number;
    upperBoundExclusive?: number;
    upperBoundInclusive?: number;
    modelName: string;
}): number {
    if (!Number.isFinite(params.value) || !Number.isInteger(params.value) || params.value <= 0) {
        throw createModelCapabilityError({
            code: params.field === "maxTokens" ? "INVALID_MAX_TOKENS" : "INVALID_REASONING_BUDGET",
            message: `${params.field} must be a finite, positive integer.`,
        });
    }
    if (params.upperBoundInclusive !== undefined && params.value > params.upperBoundInclusive) {
        throw createModelCapabilityError({
            code: "MAX_TOKENS_EXCEEDS_MODEL_LIMIT",
            message: `${params.modelName} supports at most ${params.upperBoundInclusive.toLocaleString()} output tokens.`,
        });
    }
    if (params.upperBoundExclusive !== undefined && params.value >= params.upperBoundExclusive) {
        throw createModelCapabilityError({
            code: "INVALID_REASONING_BUDGET",
            message: "reasoningBudgetTokens must be smaller than maxTokens so the model can return a visible answer.",
        });
    }
    return params.value;
}

function normalizeCompletionBudget(
    model: ModelCapabilityRecord,
    effort: ReasoningEffort,
    requestedMaxTokens: number | undefined,
): number {
    if (requestedMaxTokens !== undefined) {
        return validatePositiveIntegerBudget({
            field: "maxTokens",
            value: requestedMaxTokens,
            upperBoundInclusive: model.maxOutputTokens,
            modelName: model.name,
        });
    }
    return getDefaultCompletionTokens(effort, model.maxOutputTokens);
}

function normalizeReasoningBudget(params: {
    model: ModelCapabilityRecord;
    effort: ReasoningEffort;
    maxTokens: number;
    requestedBudget: number | undefined;
}): number | undefined {
    const defaultBudget = getDefaultProviderReasoningBudget(
        params.model.providerDialect,
        params.effort,
    );
    const budget = params.requestedBudget ?? defaultBudget;
    if (budget === undefined) return undefined;

    if (params.requestedBudget === undefined && budget >= params.maxTokens) {
        // A caller may intentionally request a tiny completion. In that edge
        // case let the provider manage reasoning rather than consuming the
        // entire allowance with our normal default.
        return params.maxTokens > 1 ? params.maxTokens - 1 : undefined;
    }

    return validatePositiveIntegerBudget({
        field: "reasoningBudgetTokens",
        value: budget,
        upperBoundExclusive: params.maxTokens,
        modelName: params.model.name,
    });
}

function validateImageInputs(model: ModelCapabilityRecord | undefined, options: ChatOptions): void {
    const imageInputs = options.imageInputs ?? [];
    if (imageInputs.length === 0) return;

    if (!model?.capabilities.includes("vision")) {
        throw createModelCapabilityError({
            code: "UNSUPPORTED_IMAGE_INPUT",
            message: `${model?.name ?? options.model ?? "The selected model"} does not support image input.`,
        });
    }

    for (const image of imageInputs) {
        if (model.providerDialect === "xai" && image.mimeType === "image/webp") {
            throw createModelCapabilityError({
                code: "UNSUPPORTED_IMAGE_FORMAT",
                message: `${model.name} supports PNG and JPEG images, but not WebP. Convert ${image.filename} before sending.`,
            });
        }
        const expectedPrefix = `data:${image.mimeType};base64,`;
        if (!image.dataUrl.startsWith(expectedPrefix) || image.dataUrl.length === expectedPrefix.length) {
            throw createModelCapabilityError({
                code: "INVALID_IMAGE_INPUT",
                message: `The hydrated image payload for ${image.filename} is invalid.`,
            });
        }
    }
}

export function normalizeChatOptionsForModel(options: ChatOptions = {}): NormalizedProviderChatOptions {
    const model = options.model || AI_CONFIG.defaultModel;
    const capabilityRecord = getModelCapabilityRecord(model);
    validateImageInputs(capabilityRecord, options);

    if (!capabilityRecord) {
        const maxTokens = options.maxTokens === undefined
            ? AI_CONFIG.defaultMaxTokens
            : validatePositiveIntegerBudget({
                field: "maxTokens",
                value: options.maxTokens,
                modelName: model,
            });
        const reasoningBudgetTokens = options.reasoningBudgetTokens === undefined
            ? undefined
            : validatePositiveIntegerBudget({
                field: "reasoningBudgetTokens",
                value: options.reasoningBudgetTokens,
                upperBoundExclusive: maxTokens,
                modelName: model,
            });
        return {
            ...options,
            model,
            providerModelId: model,
            providerDialect: "openai",
            maxTokens,
            temperature: options.temperature ?? AI_CONFIG.defaultTemperature,
            includeReasoning: !!options.includeReasoning,
            reasoningBudgetTokens,
            reasoningEffort: options.reasoningEffort ?? "medium",
            deliveryMode: options.deliveryMode ?? "standard",
        };
    }

    const reasoningEffort = normalizeReasoningEffort(capabilityRecord, options.reasoningEffort);
    const maxTokens = normalizeCompletionBudget(capabilityRecord, reasoningEffort, options.maxTokens);
    const reasoningBudgetTokens = normalizeReasoningBudget({
        model: capabilityRecord,
        effort: reasoningEffort,
        maxTokens,
        requestedBudget: options.reasoningBudgetTokens,
    });
    const reasoning = normalizeReasoningVisibility({
        model: capabilityRecord,
        includeReasoning: options.includeReasoning,
        reasoningBudgetTokens,
    });

    return {
        ...options,
        model,
        providerModelId: capabilityRecord.providerModelId,
        providerDialect: capabilityRecord.providerDialect,
        maxTokens,
        temperature: normalizeTemperature(capabilityRecord, options.temperature),
        includeReasoning: reasoning.includeReasoning,
        reasoningBudgetTokens: reasoning.reasoningBudgetTokens,
        reasoningEffort,
        deliveryMode: normalizeDeliveryMode(capabilityRecord, options.deliveryMode),
    };
}
