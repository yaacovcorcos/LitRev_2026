import "server-only";

import { prisma } from "@/lib/server/prisma";
import { DEFAULT_CONVERSATION_RUN_STALE_MS } from "@/lib/server/chat-runtime/conversation-run-lock";
import type {
    AIStreamChunk,
    RunRecoveryRecommendation,
    RunRecoveryReplayableChunk,
    RunRecoveryResponse,
    ToolCall,
    ToolResult,
} from "@/types/ai";
import type { RunEventType, RunStatus } from "@/types/agent";

export const REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES = [
    "message",
    "tool_call",
    "tool_result",
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
    messageRole: string | null;
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

function toReplayableChunk(
    run: RecoveryRunRecord,
    event: RecoveryRunEventRecord,
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
                messageRole: true,
            },
        }) as Promise<RecoveryRunEventRecord[]>,
        prisma.runEvent.findFirst({
            where: { runId: run.id },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
        }),
    ]);

    const replayableEvents = events
        .map((event) => toReplayableChunk(run, event))
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
