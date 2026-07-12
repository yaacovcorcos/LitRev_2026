import "server-only";

import { getProviderModelId } from "@/lib/ai/config";
import { resolveUserInputQuestionId } from "@/lib/ai/user-input";
import { prisma } from "@/lib/server/prisma";
import { assessRunConvergence } from "@/lib/server/agent/run-convergence";
import { resolveDurableContinuationSource } from "@/lib/server/agent/durable-continuation";
import { resolveLatestValidRunCheckpoint } from "@/lib/server/agent/run-checkpoints";
import {
    RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES,
    type RecoveryAuthoritativeRunEventType,
} from "@/lib/server/agent/run-event-authority";
import type {
    AIStreamChunk,
    AIErrorEnvelope,
    RunRecoveryReplayableChunk,
    RunRecoveryResponse,
    ToolCall,
    ToolResult,
    UserInputRequest,
    UserInputResolution,
} from "@/types/ai";
import type {
    RunAbnormalEndClassification,
    RunDurabilityState,
    RunFinalizationState,
    RunPhase,
    RunStatus,
} from "@/types/agent";

type RecoveryRunRecord = {
    id: string;
    conversationId: string | null;
    status: RunStatus;
    runPhase: RunPhase;
    phaseEnteredAt: Date;
    model: string | null;
    actualModel: string | null;
    actualProvider: string | null;
    actualReasoningEffort: string | null;
    actualDeliveryMode: string | null;
    costTokensIn: number;
    costTokensOut: number;
    lastActivityAt: Date;
    lastDurableProgressAt: Date;
    durabilityState: RunDurabilityState;
    durabilityDegradedReason: string | null;
    finalizationState: RunFinalizationState;
    abnormalEndClassification: RunAbnormalEndClassification | null;
};

type RecoveryRunEventRecord = {
    sequence: number;
    type: RecoveryAuthoritativeRunEventType;
    payload: unknown;
    toolName: string | null;
    artifactId: string | null;
    messageRole: string | null;
};

type RecoveryArtifactRecord = {
    id: string;
    type: string;
    status: string;
    title: string;
    payload: unknown;
    version: number;
};

// Heartbeats are written every 15 seconds. Three missed heartbeats are enough
// to prove that the request-bound worker no longer owns the run while leaving
// a full interval of jitter beyond a single delayed heartbeat.
export const RUN_RECOVERY_ABANDONED_STALE_MS = 45_000;

const RECOVERY_RUN_SELECT = {
    id: true,
    conversationId: true,
    status: true,
    runPhase: true,
    phaseEnteredAt: true,
    model: true,
    actualModel: true,
    actualProvider: true,
    actualReasoningEffort: true,
    actualDeliveryMode: true,
    costTokensIn: true,
    costTokensOut: true,
    lastActivityAt: true,
    lastDurableProgressAt: true,
    durabilityState: true,
    durabilityDegradedReason: true,
    finalizationState: true,
    abnormalEndClassification: true,
} as const;

async function findRecoveryRun(
    conversationId: string,
    runId: string,
): Promise<RecoveryRunRecord | null> {
    return prisma.agentRun.findFirst({
        where: { id: runId, conversationId },
        select: RECOVERY_RUN_SELECT,
    }) as Promise<RecoveryRunRecord | null>;
}

async function reconcileAbandonedRun(params: {
    run: RecoveryRunRecord;
    conversationId: string;
    now: Date;
    staleMs: number;
}): Promise<{ run: RecoveryRunRecord; terminalizedByRecovery: boolean }> {
    const assessment = assessRunConvergence(params.run, params.now, params.staleMs);
    if (params.run.status !== "running" || !assessment.activityStale) {
        return { run: params.run, terminalizedByRecovery: false };
    }

    const staleCutoff = new Date(params.now.getTime() - params.staleMs);
    // This value is also the durable retry marker: a later recovery request
    // can distinguish a run terminalized by missed heartbeats from an
    // unrelated ordinary provider/runtime failure.
    const abnormalEndClassification: RunAbnormalEndClassification = "network_disconnect";
    const terminalized = await prisma.agentRun.updateMany({
        where: {
            id: params.run.id,
            conversationId: params.conversationId,
            status: "running",
            completedAt: null,
            lastActivityAt: { lte: staleCutoff },
        },
        data: {
            status: "failed",
            runPhase: "finalize",
            phaseEnteredAt: params.now,
            completedAt: params.now,
            lastActivityAt: params.now,
            lastDurableProgressAt: params.now,
            finalizationState: "completed",
            abnormalEndClassification,
            memoryExtractionStatus: "skipped",
            memoryExtractionAttempts: 0,
            memoryExtractionLeaseToken: null,
            memoryExtractionLeaseExpiresAt: null,
            memoryExtractionCompletedAt: params.now,
            memoryExtractionLastError: null,
        },
    });

    if (terminalized.count === 1) {
        return {
            run: {
                ...params.run,
                status: "failed",
                runPhase: "finalize",
                phaseEnteredAt: params.now,
                lastActivityAt: params.now,
                lastDurableProgressAt: params.now,
                finalizationState: "completed",
                abnormalEndClassification,
            },
            terminalizedByRecovery: true,
        };
    }

    // A heartbeat, semantic cancellation, or another recovery request won the
    // race. Re-read its authoritative status instead of returning a stale
    // recommendation or overwriting the winning terminal state.
    return {
        run: await findRecoveryRun(params.conversationId, params.run.id) ?? params.run,
        terminalizedByRecovery: false,
    };
}

function asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function buildSyntheticTerminalReconciliationChunk(
    run: RecoveryRunRecord,
    runStatusOverride?: Extract<RunStatus, "completed" | "failed" | "cancelled" | "paused">,
): AIStreamChunk {
    const runStatus = runStatusOverride ?? run.status;
    const requestedProviderModel = run.model
        ? (getProviderModelId(run.model) ?? run.model)
        : null;
    return {
        type: "run_end",
        runId: run.id,
        runStatus,
        runCostTokensIn: run.costTokensIn,
        runCostTokensOut: run.costTokensOut,
        actualModel: run.actualModel ?? requestedProviderModel ?? undefined,
        actualModelSource: run.actualModel ? "provider" : run.model ? "requested" : "unknown",
        actualProvider: run.actualProvider ?? undefined,
        actualReasoningEffort: run.actualReasoningEffort
            ? run.actualReasoningEffort as NonNullable<AIStreamChunk["actualReasoningEffort"]>
            : undefined,
        actualDeliveryMode: run.actualDeliveryMode
            ? run.actualDeliveryMode as NonNullable<AIStreamChunk["actualDeliveryMode"]>
            : undefined,
        conversationId: run.conversationId ?? undefined,
        stopReason:
            runStatus === "paused"
                ? "paused_for_input"
                : runStatus === "cancelled"
                    ? "cancelled"
                    : undefined,
    };
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function toReplayableChunk(
    run: RecoveryRunRecord,
    event: RecoveryRunEventRecord,
    artifactsById: Map<string, RecoveryArtifactRecord>,
): RunRecoveryReplayableChunk | null {
    switch (event.type) {
        case "message": {
            if (event.messageRole !== "assistant") return null;
            const payload = asObject(event.payload);
            const content = typeof payload?.content === "string" ? payload.content : null;
            if (!content) return null;
            return {
                sequence: event.sequence,
                chunk: {
                    type: "content",
                    content,
                    contentMode: "replace",
                    replay: true,
                    conversationId: run.conversationId ?? undefined,
                },
            };
        }
        case "tool_call": {
            const payload = asObject(event.payload) as ToolCall | null;
            if (!payload?.id || !payload.name || !payload.arguments) return null;
            return {
                sequence: event.sequence,
                chunk: {
                    type: "tool_call",
                    toolCall: payload,
                    replay: true,
                    conversationId: run.conversationId ?? undefined,
                },
            };
        }
        case "tool_result": {
            const payload = asObject(event.payload) as ToolResult | null;
            if (!payload?.callId) return null;
            return {
                sequence: event.sequence,
                chunk: {
                    type: "tool_result",
                    toolResult: payload,
                    toolName: event.toolName ?? undefined,
                    replay: true,
                    conversationId: run.conversationId ?? undefined,
                },
            };
        }
        case "user_input_required": {
            const payload = asObject(event.payload) as UserInputRequest | null;
            if (!payload?.callId) return null;
            return {
                sequence: event.sequence,
                chunk: {
                    type: "user_input_required",
                    userInputRequest: {
                        ...payload,
                        questionId: resolveUserInputQuestionId(payload.questionId, payload.callId),
                    },
                    replay: true,
                    conversationId: run.conversationId ?? undefined,
                },
            };
        }
        case "user_input_resolved": {
            const payload = asObject(event.payload) as UserInputResolution | null;
            if (!payload?.callId || !payload.sourceRunId) return null;
            return {
                sequence: event.sequence,
                chunk: {
                    type: "user_input_resolved",
                    userInputResolution: {
                        ...payload,
                        questionId: resolveUserInputQuestionId(payload.questionId, payload.callId),
                    },
                    replay: true,
                    conversationId: run.conversationId ?? undefined,
                },
            };
        }
        case "artifact_proposed":
        case "artifact_reviewed": {
            const artifactId = event.artifactId ?? asString(asObject(event.payload)?.artifactId);
            if (!artifactId) return null;
            const artifact = artifactsById.get(artifactId);
            if (!artifact) return null;
            return {
                sequence: event.sequence,
                chunk: {
                    type: "artifact",
                    artifactId: artifact.id,
                    artifactType: artifact.type,
                    artifactStatus: artifact.status,
                    artifactTitle: artifact.title,
                    artifactPayload: artifact.payload,
                    artifactVersion: artifact.version,
                    replay: true,
                    conversationId: run.conversationId ?? undefined,
                },
            };
        }
        case "checkpoint": {
            const payload = asObject(event.payload);
            const checkpointLabel = asString(payload?.checkpointLabel) ?? asString(payload?.label);
            if (!checkpointLabel) return null;
            return {
                sequence: event.sequence,
                chunk: {
                    type: "checkpoint",
                    checkpointLabel,
                    replay: true,
                    conversationId: run.conversationId ?? undefined,
                },
            };
        }
        case "error": {
            const payload = asObject(event.payload);
            const errorMessage = asString(payload?.error);
            const errorMeta = asObject(payload?.errorMeta) as AIErrorEnvelope | null;
            if (!errorMessage && !errorMeta?.message) return null;
            return {
                sequence: event.sequence,
                chunk: {
                    type: "error",
                    error: errorMessage ?? errorMeta?.message ?? "Unknown error",
                    errorMeta: errorMeta ?? undefined,
                    errorStatus: errorMeta?.status,
                    errorCode: errorMeta?.code,
                    errorHeaders: errorMeta?.headers,
                    replay: true,
                    conversationId: run.conversationId ?? undefined,
                },
            };
        }
        default:
            return null;
    }
}

export async function buildRunRecoveryResponse(params: {
    conversationId: string;
    runId: string;
    afterSequence?: number;
    now?: Date;
    staleMs?: number;
}): Promise<RunRecoveryResponse> {
    const afterSequence = params.afterSequence ?? -1;
    const now = params.now ?? new Date();
    const staleMs = params.staleMs ?? RUN_RECOVERY_ABANDONED_STALE_MS;

    let run = await findRecoveryRun(params.conversationId, params.runId);

    if (!run) {
        return {
            conversationId: params.conversationId,
            runId: params.runId,
            runStatus: "missing",
            isActive: false,
            runPhase: null,
            phaseEnteredAt: null,
            lastActivityAt: null,
            lastDurableProgressAt: null,
            durabilityState: null,
            durabilityDegradedReason: null,
            finalizationState: null,
            lastSequence: null,
            replayableEvents: [],
            terminalEvent: null,
            recoveryRecommendation: "retry",
            abnormalEndClassification: null,
        };
    }

    const latestUserInputRequiredEvent = run.runPhase === "ask"
        ? await prisma.runEvent.findFirst({
            where: { runId: run.id, type: "user_input_required" },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
        })
        : null;
    const latestUserInputResolvedEvent = run.runPhase === "ask"
        ? await prisma.runEvent.findFirst({
            where: { runId: run.id, type: "user_input_resolved" },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
        })
        : null;

    const shouldSurfacePausedTerminal =
        run.status === "running"
        && run.runPhase === "ask"
        && latestUserInputRequiredEvent !== null
        && (
            latestUserInputResolvedEvent === null
            || latestUserInputResolvedEvent.sequence < latestUserInputRequiredEvent.sequence
        );
    let terminalizedByRecovery = false;
    if (!shouldSurfacePausedTerminal) {
        const reconciliation = await reconcileAbandonedRun({
            run,
            conversationId: params.conversationId,
            now,
            staleMs,
        });
        run = reconciliation.run;
        terminalizedByRecovery = reconciliation.terminalizedByRecovery;
    }

    // Snapshot replayable events only after run ownership has converged. If a
    // worker committed its final assistant event while stale reconciliation
    // lost the compare-and-set race, this query must observe that event before
    // the synthetic run_end is returned.
    const [events, lastEvent] = await Promise.all([
        prisma.runEvent.findMany({
            where: {
                runId: run.id,
                sequence: { gt: afterSequence },
                type: { in: [...RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES] },
            },
            orderBy: { sequence: "asc" },
            select: {
                sequence: true,
                type: true,
                payload: true,
                toolName: true,
                artifactId: true,
                messageRole: true,
            },
        }) as Promise<RecoveryRunEventRecord[]>,
        prisma.runEvent.findFirst({
            where: { runId: run.id },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
        }),
    ]);
    const artifactIds = [...new Set(events.map((event) => event.artifactId).filter((value): value is string => Boolean(value)))];
    const artifacts = artifactIds.length === 0
        ? []
        : await prisma.artifact.findMany({
            where: { id: { in: artifactIds } },
            select: {
                id: true,
                type: true,
                status: true,
                title: true,
                payload: true,
                version: true,
            },
        }) as RecoveryArtifactRecord[];
    const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    const replayRun = run;
    const replayableEvents = events
        .map((event) => toReplayableChunk(replayRun, event, artifactsById))
        .filter((event): event is RunRecoveryReplayableChunk => event !== null);

    const convergence = assessRunConvergence(run, now, staleMs);
    const effectiveRunStatus: RunRecoveryResponse["runStatus"] =
        shouldSurfacePausedTerminal ? "paused" : run.status;
    const shouldResolveContinuation =
        !shouldSurfacePausedTerminal
        && (
            terminalizedByRecovery
            || (
                run.status === "failed"
                && run.finalizationState === "completed"
                && run.abnormalEndClassification === "network_disconnect"
            )
            || (
                run.status === "running"
                && convergence.recoveryRecommendation !== "reconnect"
            )
        );
    const checkpointContinuationSource = !shouldResolveContinuation
        ? null
        : await resolveLatestValidRunCheckpoint({
            runId: run.id,
            conversationId: params.conversationId,
        });
    const durableContinuationSource = (!shouldResolveContinuation || checkpointContinuationSource)
        ? null
        : await resolveDurableContinuationSource({
            runId: run.id,
            conversationId: params.conversationId,
        });
    const recoveryRecommendation = shouldSurfacePausedTerminal
        ? "terminal"
        : checkpointContinuationSource
        ? "continue_from_checkpoint"
        : durableContinuationSource
            ? "continue_from_durable_state"
            : convergence.recoveryRecommendation;
    const hasSafeContinuation = Boolean(checkpointContinuationSource || durableContinuationSource);
    const terminalEvent = shouldSurfacePausedTerminal
        ? { chunk: buildSyntheticTerminalReconciliationChunk(run, "paused") }
        : hasSafeContinuation
            ? null
            : run.status === "running"
                ? null
                : { chunk: buildSyntheticTerminalReconciliationChunk(run) };

    return {
        conversationId: params.conversationId,
        runId: run.id,
        runStatus: effectiveRunStatus,
        isActive: run.status === "running" && !shouldSurfacePausedTerminal,
        runPhase: run.runPhase,
        phaseEnteredAt: run.phaseEnteredAt.toISOString(),
        lastActivityAt: run.lastActivityAt.toISOString(),
        lastDurableProgressAt: run.lastDurableProgressAt.toISOString(),
        durabilityState: run.durabilityState,
        durabilityDegradedReason: run.durabilityDegradedReason,
        finalizationState: run.finalizationState,
        lastSequence: lastEvent?.sequence ?? null,
        replayableEvents,
        terminalEvent,
        recoveryRecommendation,
        abnormalEndClassification: convergence.abnormalEndClassification,
    };
}

export { RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES as REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES };
