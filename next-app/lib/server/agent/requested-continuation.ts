import "server-only";

import {
    AIErrorWithEnvelope,
    createContinuationUnavailableErrorEnvelope,
} from "@/lib/ai/error-envelope";
import {
    buildDurableContinuationContext,
    resolveDurableContinuationSource,
} from "@/lib/server/agent/durable-continuation";
import {
    buildCheckpointContinuationContext,
    resolveLatestValidRunCheckpoint,
} from "@/lib/server/agent/run-checkpoints";

export type RequestedContinuationResolution = {
    sourceRunId: string | null;
    continuationContext?: string;
    sourceKind?: "checkpoint" | "durable";
};

function normalizeRunId(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

export async function resolveRequestedContinuation(params: {
    conversationId?: string | null;
    continueFromRunId?: string | null;
    preferContinueFromRunId?: string | null;
}): Promise<RequestedContinuationResolution> {
    const strictRunId = normalizeRunId(params.continueFromRunId);
    const preferredRunId = normalizeRunId(params.preferContinueFromRunId);
    const sourceRunId = strictRunId ?? preferredRunId;

    if (!sourceRunId) {
        return { sourceRunId: null };
    }

    const checkpointSource = await resolveLatestValidRunCheckpoint({
        runId: sourceRunId,
        conversationId: params.conversationId ?? null,
    });
    if (checkpointSource) {
        return {
            sourceRunId,
            continuationContext: buildCheckpointContinuationContext(checkpointSource),
            sourceKind: "checkpoint",
        };
    }

    const durableSource = await resolveDurableContinuationSource({
        runId: sourceRunId,
        conversationId: params.conversationId ?? null,
    });
    if (durableSource) {
        return {
            sourceRunId,
            continuationContext: buildDurableContinuationContext(durableSource),
            sourceKind: "durable",
        };
    }

    if (strictRunId) {
        throw new AIErrorWithEnvelope(
            createContinuationUnavailableErrorEnvelope({
                runId: strictRunId,
            }),
        );
    }

    return { sourceRunId: null };
}
