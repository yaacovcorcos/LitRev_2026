import "server-only";

import { prisma } from "@/lib/server/prisma";
import { DEFAULT_CONVERSATION_RUN_STALE_MS } from "@/lib/server/chat-runtime/conversation-run-lock";
import type {
    AIStreamChunk,
    AIErrorEnvelope,
    RunRecoveryRecommendation,
    RunRecoveryReplayableChunk,
    RunRecoveryResponse,
    ToolCall,
    ToolResult,
    UserInputRequest,
} from "@/types/ai";
import type { RunEventType, RunStatus } from "@/types/agent";

export const REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES = [
    "message",
    "tool_call",
    "tool_result",
    "user_input_required",
    "artifact_proposed",
    "artifact_reviewed",
    "checkpoint",
    "error",
] as const satisfies readonly RunEventType[];

type ReplayAuthoritativeRunEventType = (typeof REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES)[number];

type RecoveryRunRecord = {
    id: string;
    conversationId: string | null;
    status: RunStatus;
    model: string | null;
    costTokensIn: number;
    costTokensOut: number;
    lastActivityAt: Date;
};

type RecoveryRunEventRecord = {
    sequence: number;
    type: ReplayAuthoritativeRunEventType;
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

function asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function buildSyntheticTerminalReconciliationChunk(run: RecoveryRunRecord): AIStreamChunk {
    return {
        type: "run_end",
        runId: run.id,
        runStatus: run.status,
        runCostTokensIn: run.costTokensIn,
        runCostTokensOut: run.costTokensOut,
        actualModel: run.model ?? undefined,
        actualModelSource: run.model ? "requested" : "unknown",
        conversationId: run.conversationId ?? undefined,
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
                    userInputRequest: payload,
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

function deriveRecoveryRecommendation(
    run: RecoveryRunRecord | null,
    now: Date,
    staleMs: number,
): RunRecoveryRecommendation {
    if (!run) return "retry";
    if (run.status !== "running") return "retry";
    const staleCutoff = now.getTime() - staleMs;
    if (run.lastActivityAt.getTime() < staleCutoff) {
        return "stop_and_retry";
    }
    return "reconnect";
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
    const staleMs = params.staleMs ?? DEFAULT_CONVERSATION_RUN_STALE_MS;

    const run = await prisma.agentRun.findFirst({
        where: {
            id: params.runId,
            conversationId: params.conversationId,
        },
        select: {
            id: true,
            conversationId: true,
            status: true,
            model: true,
            costTokensIn: true,
            costTokensOut: true,
            lastActivityAt: true,
        },
    }) as RecoveryRunRecord | null;

    if (!run) {
        return {
            conversationId: params.conversationId,
            runId: params.runId,
            runStatus: "missing",
            isActive: false,
            lastActivityAt: null,
            lastSequence: null,
            replayableEvents: [],
            terminalEvent: null,
            recoveryRecommendation: "retry",
            abnormalEndClassification: null,
        };
    }

    const [events, lastEvent] = await Promise.all([
        prisma.runEvent.findMany({
            where: {
                runId: run.id,
                sequence: { gt: afterSequence },
                type: { in: [...REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES] },
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

    const replayableEvents = events
        .map((event) => toReplayableChunk(run, event, artifactsById))
        .filter((event): event is RunRecoveryReplayableChunk => event !== null);
    const recoveryRecommendation = deriveRecoveryRecommendation(run, now, staleMs);

    return {
        conversationId: params.conversationId,
        runId: run.id,
        runStatus: run.status,
        isActive: run.status === "running",
        lastActivityAt: run.lastActivityAt.toISOString(),
        lastSequence: lastEvent?.sequence ?? null,
        replayableEvents,
        terminalEvent: run.status === "running"
            ? null
            : { chunk: buildSyntheticTerminalReconciliationChunk(run) },
        recoveryRecommendation,
        abnormalEndClassification: null,
    };
}
