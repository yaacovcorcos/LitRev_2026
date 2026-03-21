import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/server/prisma";
import type { ToolResult } from "@/types/ai";

const CHECKPOINT_CONTEXT_MAX_CHARS = 4_000;
const CHECKPOINT_SCAN_LIMIT = 10;

type RunCheckpointTransactionClient = Prisma.TransactionClient;

type RunCheckpointRecord = {
    id: string;
    runId: string;
    conversationId: string;
    kind: string;
    status: string;
    nextStep: string;
    seedVersion: number;
    seed: unknown;
    sourceEventSequence: number;
    sourceArtifactId: string | null;
    invalidatedReason: string | null;
};

type ToolResultEventRecord = {
    sequence: number;
    type: string;
    payload: unknown;
    toolName: string | null;
};

type ArtifactRecord = {
    id: string;
    type: string;
    status: string;
    title: string;
    payload: unknown;
    version: number;
};

export type ToolResultCheckpointSeed = {
    sourceRunId: string;
    sourceEventSequence: number;
    toolCallId: string;
    toolName: string;
    toolResult: ToolResult;
};

export type ArtifactCheckpointSeed = {
    sourceRunId: string;
    sourceEventSequence: number;
    artifactId: string;
    artifactType: string;
    artifactStatus: string;
    artifactTitle: string;
    artifactVersion: number;
    artifactPayload: unknown;
};

export type RunCheckpointSeed = ToolResultCheckpointSeed | ArtifactCheckpointSeed;

export type CheckpointContinuationSource =
    | ({
        checkpointId: string;
        conversationId: string;
        nextStep: "reason_from_tool_result";
        kind: "tool_result_ready";
      } & ToolResultCheckpointSeed)
    | ({
        checkpointId: string;
        conversationId: string;
        nextStep: "reason_from_artifact_state";
        kind: "artifact_ready";
      } & ArtifactCheckpointSeed);

function asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function serializeForPrompt(value: unknown): string {
    const serialized = JSON.stringify(value, null, 2) ?? String(value);
    if (serialized.length <= CHECKPOINT_CONTEXT_MAX_CHARS) {
        return serialized;
    }
    return `${serialized.slice(0, CHECKPOINT_CONTEXT_MAX_CHARS)}\n... [truncated]`;
}

export function isCheckpointEligibleToolResult(params: {
    toolName: string | null | undefined;
    toolResult: ToolResult;
}): boolean {
    return Boolean(
        params.toolName
        && params.toolResult.callId
        && params.toolResult.result != null
        && !params.toolResult.error
        && !params.toolResult.blockedByAutonomy
        && !params.toolResult.requiresUserInput,
    );
}

function buildToolResultCheckpointSeed(params: {
    runId: string;
    eventSequence: number;
    toolName: string;
    toolResult: ToolResult;
}): ToolResultCheckpointSeed {
    return {
        sourceRunId: params.runId,
        sourceEventSequence: params.eventSequence,
        toolCallId: params.toolResult.callId,
        toolName: params.toolName,
        toolResult: params.toolResult,
    };
}

function buildArtifactCheckpointSeed(params: {
    runId: string;
    eventSequence: number;
    artifact: ArtifactRecord;
}): ArtifactCheckpointSeed {
    return {
        sourceRunId: params.runId,
        sourceEventSequence: params.eventSequence,
        artifactId: params.artifact.id,
        artifactType: params.artifact.type,
        artifactStatus: params.artifact.status,
        artifactTitle: params.artifact.title,
        artifactVersion: params.artifact.version,
        artifactPayload: params.artifact.payload,
    };
}

export async function createToolResultCheckpointInTransaction(
    tx: RunCheckpointTransactionClient,
    params: {
        runId: string;
        conversationId?: string | null;
        eventSequence: number;
        toolName: string | null | undefined;
        toolResult: ToolResult;
    },
): Promise<void> {
    if (!params.conversationId) return;
    if (!isCheckpointEligibleToolResult({
        toolName: params.toolName,
        toolResult: params.toolResult,
    })) {
        return;
    }

    await tx.runCheckpoint.create({
        data: {
            runId: params.runId,
            conversationId: params.conversationId,
            kind: "tool_result_ready",
            status: "ready",
            nextStep: "reason_from_tool_result",
            seedVersion: 1,
            seed: buildToolResultCheckpointSeed({
                runId: params.runId,
                eventSequence: params.eventSequence,
                toolName: params.toolName!,
                toolResult: params.toolResult,
            }) as unknown as Prisma.InputJsonValue,
            sourceEventSequence: params.eventSequence,
        },
    });
}

export async function createArtifactCheckpointInTransaction(
    tx: RunCheckpointTransactionClient,
    params: {
        runId: string;
        conversationId?: string | null;
        eventSequence: number;
        artifact: ArtifactRecord;
    },
): Promise<void> {
    if (!params.conversationId) return;
    if (params.artifact.status === "rejected" || params.artifact.status === "collapsed") {
        return;
    }

    await tx.runCheckpoint.create({
        data: {
            runId: params.runId,
            conversationId: params.conversationId,
            kind: "artifact_ready",
            status: "ready",
            nextStep: "reason_from_artifact_state",
            seedVersion: 1,
            seed: buildArtifactCheckpointSeed({
                runId: params.runId,
                eventSequence: params.eventSequence,
                artifact: params.artifact,
            }) as unknown as Prisma.InputJsonValue,
            sourceEventSequence: params.eventSequence,
            sourceArtifactId: params.artifact.id,
        },
    });
}

async function invalidateCheckpointIfReady(
    checkpointId: string,
    reason: string,
): Promise<void> {
    await prisma.runCheckpoint.updateMany({
        where: {
            id: checkpointId,
            status: "ready",
        },
        data: {
            status: "invalidated",
            invalidatedReason: reason,
        },
    });
}

function parseToolResultSeed(value: unknown): ToolResultCheckpointSeed | null {
    const seed = asObject(value);
    if (!seed) return null;
    const sourceRunId = asString(seed.sourceRunId);
    const toolCallId = asString(seed.toolCallId);
    const toolName = asString(seed.toolName);
    const toolResult = asObject(seed.toolResult) as ToolResult | null;
    const sourceEventSequence = typeof seed.sourceEventSequence === "number"
        ? seed.sourceEventSequence
        : null;
    if (!sourceRunId || !toolCallId || !toolName || !toolResult || sourceEventSequence == null) {
        return null;
    }
    return {
        sourceRunId,
        sourceEventSequence,
        toolCallId,
        toolName,
        toolResult,
    };
}

function parseArtifactSeed(value: unknown): ArtifactCheckpointSeed | null {
    const seed = asObject(value);
    if (!seed) return null;
    const sourceRunId = asString(seed.sourceRunId);
    const artifactId = asString(seed.artifactId);
    const artifactType = asString(seed.artifactType);
    const artifactStatus = asString(seed.artifactStatus);
    const artifactTitle = asString(seed.artifactTitle);
    const sourceEventSequence = typeof seed.sourceEventSequence === "number"
        ? seed.sourceEventSequence
        : null;
    const artifactVersion = typeof seed.artifactVersion === "number"
        ? seed.artifactVersion
        : null;
    if (!sourceRunId || !artifactId || !artifactType || !artifactStatus || !artifactTitle || sourceEventSequence == null || artifactVersion == null) {
        return null;
    }
    return {
        sourceRunId,
        sourceEventSequence,
        artifactId,
        artifactType,
        artifactStatus,
        artifactTitle,
        artifactVersion,
        artifactPayload: seed.artifactPayload,
    };
}

async function validateToolResultCheckpoint(
    checkpoint: RunCheckpointRecord,
): Promise<CheckpointContinuationSource | null> {
    const seed = parseToolResultSeed(checkpoint.seed);
    if (!seed) {
        await invalidateCheckpointIfReady(checkpoint.id, "invalid_seed");
        return null;
    }
    if (seed.sourceRunId !== checkpoint.runId) {
        await invalidateCheckpointIfReady(checkpoint.id, "source_run_drift");
        return null;
    }

    const event = await prisma.runEvent.findFirst({
        where: {
            runId: checkpoint.runId,
            sequence: checkpoint.sourceEventSequence,
            type: "tool_result",
        },
        select: {
            sequence: true,
            type: true,
            payload: true,
            toolName: true,
        },
    }) as ToolResultEventRecord | null;

    if (!event || !isCheckpointEligibleToolResult({
        toolName: event.toolName,
        toolResult: asObject(event.payload) as ToolResult,
    })) {
        await invalidateCheckpointIfReady(checkpoint.id, "source_event_missing_or_invalid");
        return null;
    }

    const payload = asObject(event.payload) as ToolResult | null;
    if (!payload || payload.callId !== seed.toolCallId || event.toolName !== seed.toolName) {
        await invalidateCheckpointIfReady(checkpoint.id, "source_event_drift");
        return null;
    }

    return {
        checkpointId: checkpoint.id,
        conversationId: checkpoint.conversationId,
        kind: "tool_result_ready",
        nextStep: "reason_from_tool_result",
        ...seed,
    };
}

async function validateArtifactCheckpoint(
    checkpoint: RunCheckpointRecord,
): Promise<CheckpointContinuationSource | null> {
    const seed = parseArtifactSeed(checkpoint.seed);
    if (!seed) {
        await invalidateCheckpointIfReady(checkpoint.id, "invalid_seed");
        return null;
    }
    if (seed.sourceRunId !== checkpoint.runId) {
        await invalidateCheckpointIfReady(checkpoint.id, "source_run_drift");
        return null;
    }
    if (checkpoint.sourceArtifactId && checkpoint.sourceArtifactId !== seed.artifactId) {
        await invalidateCheckpointIfReady(checkpoint.id, "source_artifact_reference_drift");
        return null;
    }

    const [artifact, event] = await Promise.all([
        prisma.artifact.findFirst({
            where: { id: seed.artifactId },
            select: {
                id: true,
                type: true,
                status: true,
                title: true,
                payload: true,
                version: true,
            },
        }) as Promise<ArtifactRecord | null>,
        prisma.runEvent.findFirst({
            where: {
                runId: checkpoint.runId,
                sequence: checkpoint.sourceEventSequence,
                type: { in: ["artifact_proposed", "artifact_reviewed"] },
            },
            select: {
                sequence: true,
                artifactId: true,
            },
        }),
    ]);

    if (!artifact || !event) {
        await invalidateCheckpointIfReady(checkpoint.id, "source_artifact_or_event_missing");
        return null;
    }

    if (
        artifact.id !== seed.artifactId
        || artifact.type !== seed.artifactType
        || artifact.status !== seed.artifactStatus
        || artifact.version !== seed.artifactVersion
        || artifact.title !== seed.artifactTitle
        || event.artifactId !== seed.artifactId
    ) {
        await invalidateCheckpointIfReady(checkpoint.id, "source_artifact_drift");
        return null;
    }

    if (JSON.stringify(artifact.payload) !== JSON.stringify(seed.artifactPayload)) {
        await invalidateCheckpointIfReady(checkpoint.id, "source_artifact_payload_drift");
        return null;
    }

    return {
        checkpointId: checkpoint.id,
        conversationId: checkpoint.conversationId,
        kind: "artifact_ready",
        nextStep: "reason_from_artifact_state",
        ...seed,
    };
}

export async function resolveLatestValidRunCheckpoint(params: {
    runId: string;
    conversationId?: string | null;
}): Promise<CheckpointContinuationSource | null> {
    const checkpoints = await prisma.runCheckpoint.findMany({
        where: {
            runId: params.runId,
            status: "ready",
            ...(params.conversationId ? { conversationId: params.conversationId } : {}),
        },
        orderBy: [
            { sourceEventSequence: "desc" },
            { createdAt: "desc" },
        ],
        take: CHECKPOINT_SCAN_LIMIT,
        select: {
            id: true,
            runId: true,
            conversationId: true,
            kind: true,
            status: true,
            nextStep: true,
            seedVersion: true,
            seed: true,
            sourceEventSequence: true,
            sourceArtifactId: true,
            invalidatedReason: true,
        },
    }) as RunCheckpointRecord[];

    for (const checkpoint of checkpoints) {
        if (checkpoint.seedVersion !== 1) {
            await invalidateCheckpointIfReady(checkpoint.id, "unsupported_seed_version");
            continue;
        }

        if (checkpoint.kind === "tool_result_ready") {
            const source = await validateToolResultCheckpoint(checkpoint);
            if (source) return source;
            continue;
        }

        if (checkpoint.kind === "artifact_ready") {
            const source = await validateArtifactCheckpoint(checkpoint);
            if (source) return source;
        }
    }

    return null;
}

export function buildCheckpointContinuationContext(source: CheckpointContinuationSource): string {
    if (source.kind === "tool_result_ready") {
        return [
            "seed_kind=tool_result_checkpoint",
            `source_run_id=${source.sourceRunId}`,
            `source_event_sequence=${source.sourceEventSequence}`,
            `tool_name=${source.toolName}`,
            `tool_call_id=${source.toolCallId}`,
            "authoritative_input_only=true",
            "rerun_policy=fresh_retry_only",
            "payload_json:",
            serializeForPrompt(source.toolResult),
        ].join("\n");
    }

    return [
        "seed_kind=artifact_checkpoint",
        `source_run_id=${source.sourceRunId}`,
        `source_event_sequence=${source.sourceEventSequence}`,
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
