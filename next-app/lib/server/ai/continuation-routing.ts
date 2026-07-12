import "server-only";

import {
    AI_CONFIG,
    getDefaultReasoningEffort,
    getSupportedReasoningEfforts,
    isSelectableModelId,
    modelSupportsDeliveryMode,
} from "@/lib/ai/config";
import {
    AIErrorWithEnvelope,
    createContinuationUnavailableErrorEnvelope,
} from "@/lib/ai/error-envelope";
import { prisma } from "@/lib/server/prisma";
import { isModelConfigured } from "@/lib/server/ai/model-availability";
import type { ChatOptions, DeliveryMode, ReasoningEffort } from "@/types/ai";

type ContinuationRouteRecord = {
    model: string | null;
    reasoningEffort: string | null;
    deliveryMode: string | null;
};

function resolveSourceRunId(options: ChatOptions): {
    sourceRunId: string | null;
    strict: boolean;
} {
    const structuredSourceRunId = options.userInputResolution?.sourceRunId?.trim();
    const strictSourceRunId = options.continueFromRunId?.trim() || structuredSourceRunId;
    if (strictSourceRunId) return { sourceRunId: strictSourceRunId, strict: true };
    const preferredSourceRunId = options.preferContinueFromRunId?.trim();
    return {
        sourceRunId: preferredSourceRunId || null,
        strict: false,
    };
}

function normalizeSourceRoute(source: ContinuationRouteRecord): Pick<
    ChatOptions,
    "model" | "reasoningEffort" | "deliveryMode"
> {
    const model = source.model && isSelectableModelId(source.model)
        ? source.model
        : AI_CONFIG.defaultModel;
    const reasoningEffort = source.reasoningEffort
        && getSupportedReasoningEfforts(model).includes(source.reasoningEffort as ReasoningEffort)
        ? source.reasoningEffort as ReasoningEffort
        : getDefaultReasoningEffort(model);
    const requestedDeliveryMode = source.deliveryMode === "priority" ? "priority" : "standard";
    const deliveryMode: DeliveryMode = modelSupportsDeliveryMode(model, requestedDeliveryMode)
        ? requestedDeliveryMode
        : "standard";

    return { model, reasoningEffort, deliveryMode };
}

function assertContinuationRouteReady(options: ChatOptions): void {
    const model = options.model ?? AI_CONFIG.defaultModel;
    if (!isSelectableModelId(model)) {
        throw new AIErrorWithEnvelope({
            kind: "model_capability",
            code: "UNKNOWN_OR_UNSELECTABLE_MODEL",
            retryable: false,
            source: "request_policy",
            message: `The continuation model is not selectable: ${model}.`,
        });
    }
    if (!isModelConfigured(model)) {
        throw new AIErrorWithEnvelope({
            kind: "provider_request",
            code: "MODEL_PROVIDER_NOT_CONFIGURED",
            retryable: false,
            source: "provider_request",
            message: `The provider for continuation model ${model} is not configured.`,
        });
    }

    const effort = options.reasoningEffort ?? getDefaultReasoningEffort(model);
    if (!getSupportedReasoningEfforts(model).includes(effort)) {
        throw new AIErrorWithEnvelope({
            kind: "model_capability",
            code: "UNSUPPORTED_REASONING_EFFORT",
            retryable: false,
            source: "request_policy",
            message: `Reasoning effort ${String(effort)} is not supported by ${model}.`,
        });
    }

    const deliveryMode = options.deliveryMode ?? "standard";
    if (!modelSupportsDeliveryMode(model, deliveryMode)) {
        throw new AIErrorWithEnvelope({
            kind: "model_capability",
            code: "UNSUPPORTED_DELIVERY_MODE",
            retryable: false,
            source: "request_policy",
            message: `Delivery mode ${String(deliveryMode)} is not supported by ${model}.`,
        });
    }
}

/**
 * A continuation inherits its generation route from the authorized source run.
 * Client preferences may change while a run is paused, but they must not change
 * the model or paid delivery tier halfway through one durable logical task.
 */
export async function pinContinuationRoutingOptions<T extends ChatOptions>(
    options: T | undefined,
    conversationId: string,
): Promise<T | undefined> {
    if (!options) return options;
    const { sourceRunId, strict } = resolveSourceRunId(options);
    if (!sourceRunId) return options;

    const source = await prisma.agentRun.findFirst({
        where: {
            id: sourceRunId,
            conversationId,
        },
        select: {
            model: true,
            reasoningEffort: true,
            deliveryMode: true,
        },
    }) as ContinuationRouteRecord | null;

    if (!source) {
        if (!strict) {
            assertContinuationRouteReady(options);
            return options;
        }
        throw new AIErrorWithEnvelope(
            createContinuationUnavailableErrorEnvelope({ runId: sourceRunId }),
        );
    }

    const pinnedOptions = {
        ...options,
        ...normalizeSourceRoute(source),
    };
    assertContinuationRouteReady(pinnedOptions);
    return pinnedOptions;
}
