/**
 * RunEvent Creation & Querying
 * Emits and retrieves events within an agent run (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { RunEventType } from "@/types/agent";

export interface EmitEventExtras {
    toolName?: string;
    artifactId?: string;
    messageRole?: string;
    tokensIn?: number;
    tokensOut?: number;
    errorCode?: string;
    durationMs?: number;
}

/**
 * Emit a new event in a run.
 * Sequence is auto-assigned as max(sequence) + 1 within the run.
 */
export async function emitEvent(
    runId: string,
    type: RunEventType,
    payload: unknown,
    extras?: EmitEventExtras
) {
    // Get next sequence number
    const lastEvent = await prisma.runEvent.findFirst({
        where: { runId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
    });
    const sequence = (lastEvent?.sequence ?? -1) + 1;

    return prisma.runEvent.create({
        data: {
            runId,
            sequence,
            type,
            payload: payload as object,
            toolName: extras?.toolName ?? null,
            artifactId: extras?.artifactId ?? null,
            messageRole: extras?.messageRole ?? null,
            tokensIn: extras?.tokensIn ?? null,
            tokensOut: extras?.tokensOut ?? null,
            errorCode: extras?.errorCode ?? null,
            durationMs: extras?.durationMs ?? null,
        },
    });
}

/**
 * Get all events for a run, ordered by sequence
 */
export async function getRunEvents(runId: string) {
    return prisma.runEvent.findMany({
        where: { runId },
        orderBy: { sequence: "asc" },
    });
}

/**
 * Get events of a specific type within a run
 */
export async function getRunEventsByType(runId: string, type: RunEventType) {
    return prisma.runEvent.findMany({
        where: { runId, type },
        orderBy: { sequence: "asc" },
    });
}

/**
 * Get the timeline view of a run (events formatted for client consumption)
 */
export async function getRunTimeline(runId: string) {
    const events = await getRunEvents(runId);

    return events.map((event) => ({
        id: event.id,
        sequence: event.sequence,
        type: event.type,
        payload: event.payload,
        toolName: event.toolName,
        artifactId: event.artifactId,
        messageRole: event.messageRole,
        durationMs: event.durationMs,
        createdAt: event.createdAt.toISOString(),
    }));
}
