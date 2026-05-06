/**
 * RunEvent Creation & Querying
 * Emits and retrieves events within an agent run (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import type { RunEventType } from "@/types/agent";
import {
    assertRunWritableInTransaction,
    noteObservedRunActivity,
} from "@/lib/server/agent/run";
import { isDurableProgressRunEventType } from "@/lib/server/agent/run-event-authority";
import { transitionRunPhaseInTransaction } from "@/lib/server/agent/run-phase";
import { getRunPhaseForEventType } from "@/lib/server/agent/run-state-machine";

export interface EmitEventExtras {
    toolName?: string;
    artifactId?: string;
    messageRole?: string;
    tokensIn?: number;
    tokensOut?: number;
    errorCode?: string;
    durationMs?: number;
}

const MAX_SEQUENCE_RETRY_ATTEMPTS = 5;

type RunEventTransactionClient = Prisma.TransactionClient;
export type EmitEventAfterCreate = (
    tx: RunEventTransactionClient,
    event: Awaited<ReturnType<typeof emitEventWithinTransaction>>,
) => Promise<void>;

function getAllowedStatusesForEventType(type: RunEventType) {
    return type === "user_input_resolved"
        ? ["running", "paused"] as const
        : ["running"] as const;
}

function isRunSequenceConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown; meta?: { target?: unknown } };
    if (candidate.code !== "P2002") return false;
    const target = candidate.meta?.target;
    if (!Array.isArray(target)) return false;
    const cols = target.map((value) => String(value));
    return cols.includes("runId") && cols.includes("sequence");
}

function isRetryableRunEventTransactionError(error: unknown): boolean {
    if (isRunSequenceConflict(error)) return true;
    if (!error || typeof error !== "object") return false;
    return (error as { code?: unknown }).code === "P2034";
}

async function lockRunEventSequenceInTransaction(
    tx: RunEventTransactionClient,
    runId: string,
): Promise<void> {
    // PostgreSQL-specific transaction advisory lock. It serializes max(sequence)+1
    // allocation per run without taking the hot AgentRun row lock on every event.
    // hashtext is deterministic; a rare collision would only serialize unrelated
    // runs for this short transaction, not mix their run-scoped sequence values.
    // Project a scalar instead of the lock function's PostgreSQL void result;
    // Prisma cannot deserialize void columns on recent clients.
    await tx.$queryRaw<{ locked: number }[]>`
        SELECT 1 AS locked
        FROM pg_advisory_xact_lock(hashtext(${`run-event:${runId}`}))
    `;
}

/**
 * Creates a new event in a run inside an existing transaction.
 * Sequence is assigned as max(sequence) + 1 within the run's current event stream.
 */
export async function emitEventWithinTransaction(
    tx: RunEventTransactionClient,
    runId: string,
    type: RunEventType,
    payload: unknown,
    extras?: EmitEventExtras,
) {
    const runSnapshot = await assertRunWritableInTransaction(tx, {
        runId,
        allowedStatuses: [...getAllowedStatusesForEventType(type)],
        requireIncomplete: type !== "user_input_resolved",
    });
    await lockRunEventSequenceInTransaction(tx, runId);
    const lastEvent = await tx.runEvent.findFirst({
        where: { runId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
    });
    const sequence = (lastEvent?.sequence ?? -1) + 1;

    const event = await tx.runEvent.create({
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

    const nextPhase = getRunPhaseForEventType(type, {
        status: runSnapshot.status,
        runPhase: runSnapshot.runPhase,
        finalizationState: runSnapshot.finalizationState,
        completedAt: runSnapshot.completedAt,
    });
    if (nextPhase) {
        await transitionRunPhaseInTransaction(tx, runId, nextPhase, event.createdAt);
    }

    const activityUpdate = await tx.agentRun.updateMany({
        where: {
            id: runId,
            status: { in: [...getAllowedStatusesForEventType(type)] },
            ...(type !== "user_input_resolved" ? { completedAt: null } : {}),
        },
        data: {
            lastActivityAt: event.createdAt,
            ...(isDurableProgressRunEventType(type)
                ? { lastDurableProgressAt: event.createdAt }
                : {}),
        },
    });
    if (activityUpdate.count !== 1) {
        await assertRunWritableInTransaction(tx, {
            runId,
            allowedStatuses: [...getAllowedStatusesForEventType(type)],
            requireIncomplete: type !== "user_input_resolved",
        });
        throw new Error(`Failed to update run activity after event append: ${runId}`);
    }

    return event;
}

/**
 * Emit a new event in a run.
 * Sequence is auto-assigned as max(sequence) + 1 within the run.
 */
export async function emitEvent(
    runId: string,
    type: RunEventType,
    payload: unknown,
    extras?: EmitEventExtras,
    afterCreateInTransaction?: EmitEventAfterCreate,
) {
    // Retry bounded transaction conflicts only. P2002 covers sequence unique
    // conflicts from older/unlocked writers; P2034 covers Prisma-reported
    // serialization/deadlock conflicts under concurrent Postgres writes.
    for (let attempt = 0; attempt < MAX_SEQUENCE_RETRY_ATTEMPTS; attempt++) {
        try {
            const created = await prisma.$transaction(async (tx) => {
                const event = await emitEventWithinTransaction(
                    tx,
                    runId,
                    type,
                    payload,
                    extras,
                );
                await afterCreateInTransaction?.(tx, event);
                return event;
            });
            noteObservedRunActivity(runId, created.createdAt);
            return created;
        } catch (error) {
            if (
                isRetryableRunEventTransactionError(error)
                && attempt < MAX_SEQUENCE_RETRY_ATTEMPTS - 1
            ) {
                continue;
            }
            throw error;
        }
    }

    throw new Error(`Failed to emit run event after ${MAX_SEQUENCE_RETRY_ATTEMPTS} attempts.`);
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
