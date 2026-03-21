import "server-only";

import { prisma } from "@/lib/server/prisma";
import type { ToolResult } from "@/types/ai";

const CONTINUATION_EVENT_SCAN_LIMIT = 50;
const CONTINUATION_PAYLOAD_MAX_CHARS = 4_000;

type ContinuationRunRecord = {
    id: string;
    conversationId: string | null;
};

type ContinuationRunEventRecord = {
    sequence: number;
    type: string;
    payload: unknown;
    toolName: string | null;
    artifactId: string | null;
    messageRole: string | null;
};

type ContinuationArtifactRecord = {
    id: string;
    type: string;
    status: string;
    title: string;
    payload: unknown;
    version: number;
};

export type DurableContinuationSource =
    | {
        kind: "tool_result";
        sourceRunId: string;
        conversationId: string;
        eventSequence: number;
        toolCallId: string;
        toolName: string;
        toolResult: ToolResult;
    }
    | {
        kind: "artifact_state";
        sourceRunId: string;
        conversationId: string;
        eventSequence: number;
        artifactId: string;
        artifactType: string;
        artifactStatus: string;
        artifactTitle: string;
        artifactVersion: number;
        artifactPayload: unknown;
    };

function asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function hasAuthoritativeAssistantMessage(event: ContinuationRunEventRecord): boolean {
    return event.type === "message" && event.messageRole === "assistant";
}

function isBlockingContinuationEvent(event: ContinuationRunEventRecord): boolean {
    return hasAuthoritativeAssistantMessage(event)
        || event.type === "user_input_required"
        || event.type === "tool_call";
}

function parseToolResultCandidate(
    run: ContinuationRunRecord,
    event: ContinuationRunEventRecord,
): DurableContinuationSource | null {
    const payload = asObject(event.payload) as ToolResult | null;
    if (!payload?.callId) return null;
    if (!event.toolName) return null;
    if (payload.error || payload.blockedByAutonomy || payload.requiresUserInput) {
        return null;
    }
    if (payload.result == null) {
        return null;
    }

    return {
        kind: "tool_result",
        sourceRunId: run.id,
        conversationId: run.conversationId!,
        eventSequence: event.sequence,
        toolCallId: payload.callId,
        toolName: event.toolName,
        toolResult: payload,
    };
}

function parseArtifactCandidate(
    run: ContinuationRunRecord,
    event: ContinuationRunEventRecord,
    artifact: ContinuationArtifactRecord | null | undefined,
): DurableContinuationSource | null {
    if (!artifact) return null;
    if (artifact.status === "rejected") return null;

    return {
        kind: "artifact_state",
        sourceRunId: run.id,
        conversationId: run.conversationId!,
        eventSequence: event.sequence,
        artifactId: artifact.id,
        artifactType: artifact.type,
        artifactStatus: artifact.status,
        artifactTitle: artifact.title,
        artifactVersion: artifact.version,
        artifactPayload: artifact.payload,
    };
}

function serializeForPrompt(value: unknown): string {
    const serialized = JSON.stringify(value, null, 2) ?? String(value);
    if (serialized.length <= CONTINUATION_PAYLOAD_MAX_CHARS) {
        return serialized;
    }
    return `${serialized.slice(0, CONTINUATION_PAYLOAD_MAX_CHARS)}\n... [truncated]`;
}

export async function resolveDurableContinuationSource(params: {
    runId: string;
    conversationId?: string | null;
}): Promise<DurableContinuationSource | null> {
    const run = await prisma.agentRun.findFirst({
        where: {
            id: params.runId,
            ...(params.conversationId ? { conversationId: params.conversationId } : {}),
        },
        select: {
            id: true,
            conversationId: true,
        },
    }) as ContinuationRunRecord | null;

    if (!run?.conversationId) {
        return null;
    }

    const events = await prisma.runEvent.findMany({
        where: {
            runId: run.id,
            type: {
                in: [
                    "message",
                    "tool_call",
                    "tool_result",
                    "user_input_required",
                    "artifact_proposed",
                    "artifact_reviewed",
                    "checkpoint",
                    "error",
                ],
            },
        },
        orderBy: { sequence: "desc" },
        take: CONTINUATION_EVENT_SCAN_LIMIT,
        select: {
            sequence: true,
            type: true,
            payload: true,
            toolName: true,
            artifactId: true,
            messageRole: true,
        },
    }) as ContinuationRunEventRecord[];

    if (events.length === 0) {
        return null;
    }

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
        }) as ContinuationArtifactRecord[];
    const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));

    for (const event of events) {
        if (isBlockingContinuationEvent(event)) {
            return null;
        }

        if (event.type === "artifact_proposed" || event.type === "artifact_reviewed") {
            const artifactId = event.artifactId ?? asString(asObject(event.payload)?.artifactId);
            if (!artifactId) {
                continue;
            }
            const candidate = parseArtifactCandidate(run, event, artifactsById.get(artifactId));
            if (candidate) {
                return candidate;
            }
            continue;
        }

        if (event.type === "tool_result") {
            const candidate = parseToolResultCandidate(run, event);
            if (candidate) {
                return candidate;
            }
        }
    }

    return null;
}

export function buildDurableContinuationContext(source: DurableContinuationSource): string {
    if (source.kind === "tool_result") {
        return [
            "seed_kind=tool_result",
            `source_run_id=${source.sourceRunId}`,
            `tool_name=${source.toolName}`,
            `tool_call_id=${source.toolCallId}`,
            "authoritative_input_only=true",
            "rerun_policy=fresh_retry_only",
            "payload_json:",
            serializeForPrompt(source.toolResult),
        ].join("\n");
    }

    return [
        "seed_kind=artifact_state",
        `source_run_id=${source.sourceRunId}`,
        `artifact_id=${source.artifactId}`,
        `artifact_type=${source.artifactType}`,
        `artifact_status=${source.artifactStatus}`,
        `artifact_title=${source.artifactTitle}`,
        `artifact_version=${source.artifactVersion}`,
        "authoritative_input_only=true",
        "rewrite_policy=fresh_retry_only",
        "payload_json:",
        serializeForPrompt(source.artifactPayload),
    ].join("\n");
}
