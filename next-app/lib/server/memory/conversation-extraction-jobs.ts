import "server-only";

import { randomUUID } from "crypto";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { logServerError, logServerWarn } from "@/lib/server/logging";
import {
    createAbortError,
    createDeadlineAbortController,
    throwIfAborted,
} from "@/lib/abort";
import { extractMemoriesFromConversation } from "./conversation-extractor";

export const MEMORY_EXTRACTION_LEASE_MS = 5 * 60_000;
export const MEMORY_EXTRACTION_DEADLINE_MS = 60_000;
export const MEMORY_EXTRACTION_MAX_ATTEMPTS = 5;
export const MEMORY_EXTRACTION_BACKLOG_BATCH_SIZE = 4;
const MIN_CONVERSATION_MESSAGES = 5;

export type ConversationMemoryExtractionOutcome =
    | "not_claimed"
    | "succeeded"
    | "skipped"
    | "failed"
    | "exhausted"
    | "lease_lost";

type ClaimedMemoryExtraction = {
    runId: string;
    conversationId: string;
    projectId: string;
    userId: string | null;
    leaseToken: string;
};

async function raceWithJobAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    throwIfAborted(signal);
    let removeAbortListener = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
        const onAbort = () => reject(createAbortError());
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
        if (signal.aborted) onAbort();
    });
    try {
        return await Promise.race([promise, aborted]);
    } finally {
        removeAbortListener();
    }
}

function eligibleMemoryExtractionWhere(
    now: Date,
    options?: { includeExhausted?: boolean },
): Prisma.AgentRunWhereInput {
    const attemptsRemaining = options?.includeExhausted
        ? {}
        : { memoryExtractionAttempts: { lt: MEMORY_EXTRACTION_MAX_ATTEMPTS } };
    return {
        status: "completed",
        conversationId: { not: null },
        projectId: { not: null },
        OR: [
            {
                memoryExtractionStatus: "pending",
                ...attemptsRemaining,
            },
            {
                memoryExtractionStatus: "failed",
                memoryExtractionAttempts: { lt: MEMORY_EXTRACTION_MAX_ATTEMPTS },
            },
            {
                memoryExtractionStatus: "processing",
                ...attemptsRemaining,
                OR: [
                    { memoryExtractionLeaseExpiresAt: null },
                    { memoryExtractionLeaseExpiresAt: { lte: now } },
                ],
            },
        ],
    };
}

async function terminalizeExhaustedMemoryExtraction(
    runId: string,
    now: Date,
): Promise<boolean> {
    const exhausted = await prisma.agentRun.updateMany({
        where: {
            id: runId,
            status: "completed",
            memoryExtractionAttempts: { gte: MEMORY_EXTRACTION_MAX_ATTEMPTS },
            OR: [
                { memoryExtractionStatus: "pending" },
                {
                    memoryExtractionStatus: "processing",
                    OR: [
                        { memoryExtractionLeaseExpiresAt: null },
                        { memoryExtractionLeaseExpiresAt: { lte: now } },
                    ],
                },
            ],
        },
        data: {
            memoryExtractionStatus: "failed",
            memoryExtractionLeaseToken: null,
            memoryExtractionLeaseExpiresAt: null,
            memoryExtractionCompletedAt: null,
            memoryExtractionLastError: "Memory extraction retry limit exhausted.",
        },
    });
    return exhausted.count === 1;
}

async function claimConversationMemoryExtraction(
    runId: string,
    now: Date,
): Promise<ClaimedMemoryExtraction | null> {
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + MEMORY_EXTRACTION_LEASE_MS);
    const claimed = await prisma.agentRun.updateMany({
        where: {
            id: runId,
            ...eligibleMemoryExtractionWhere(now),
        },
        data: {
            memoryExtractionStatus: "processing",
            memoryExtractionAttempts: { increment: 1 },
            memoryExtractionLeaseToken: leaseToken,
            memoryExtractionLeaseExpiresAt: leaseExpiresAt,
            memoryExtractionCompletedAt: null,
            memoryExtractionLastError: null,
        },
    });
    if (claimed.count !== 1) return null;

    const run = await prisma.agentRun.findUnique({
        where: { id: runId },
        select: {
            id: true,
            conversationId: true,
            projectId: true,
            userId: true,
            memoryExtractionStatus: true,
            memoryExtractionLeaseToken: true,
        },
    });
    if (
        !run
        || run.memoryExtractionStatus !== "processing"
        || run.memoryExtractionLeaseToken !== leaseToken
        || !run.conversationId
        || !run.projectId
    ) {
        return null;
    }

    return {
        runId: run.id,
        conversationId: run.conversationId,
        projectId: run.projectId,
        userId: run.userId,
        leaseToken,
    };
}

async function settleConversationMemoryExtraction(
    claim: ClaimedMemoryExtraction,
    status: "succeeded" | "skipped" | "failed",
    options?: { error?: unknown; completedAt?: Date },
): Promise<boolean> {
    const completedAt = options?.completedAt ?? new Date();
    const rawError = options?.error instanceof Error
        ? options.error.message
        : options?.error == null
            ? null
            : String(options.error);
    const lastError = rawError?.slice(0, 1_000) ?? null;
    const settled = await prisma.agentRun.updateMany({
        where: {
            id: claim.runId,
            memoryExtractionStatus: "processing",
            memoryExtractionLeaseToken: claim.leaseToken,
        },
        data: {
            memoryExtractionStatus: status,
            memoryExtractionLeaseToken: null,
            memoryExtractionLeaseExpiresAt: null,
            memoryExtractionCompletedAt: status === "failed" ? null : completedAt,
            memoryExtractionLastError: status === "failed" ? lastError : null,
        },
    });
    if (settled.count === 1) return true;

    logServerWarn("conversation-extractor", "memory extraction lease was lost before settlement", {
        runId: claim.runId,
        conversationId: claim.conversationId,
        attemptedStatus: status,
    });
    return false;
}

/**
 * Process one durable run-owned extraction marker. Claim and settlement are
 * fenced by a random lease token so an expired worker cannot overwrite the
 * state recorded by its replacement.
 */
export async function processConversationMemoryExtractionRun(
    runId: string,
    options?: { now?: Date; signal?: AbortSignal },
): Promise<ConversationMemoryExtractionOutcome> {
    const now = options?.now ?? new Date();
    const claim = await claimConversationMemoryExtraction(
        runId,
        now,
    );
    if (!claim) {
        const exhausted = await terminalizeExhaustedMemoryExtraction(
            runId,
            now,
        );
        return exhausted ? "exhausted" : "not_claimed";
    }

    const deadline = createDeadlineAbortController(
        MEMORY_EXTRACTION_DEADLINE_MS,
        [options?.signal],
    );
    try {
        const count = await raceWithJobAbort(prisma.aIMessage.count({
            where: {
                conversationId: claim.conversationId,
                role: { in: ["user", "assistant"] },
            },
        }), deadline.signal);
        if (count < MIN_CONVERSATION_MESSAGES) {
            const settled = await settleConversationMemoryExtraction(claim, "skipped");
            return settled ? "skipped" : "lease_lost";
        }

        await extractMemoriesFromConversation(
            claim.conversationId,
            claim.projectId,
            claim.runId,
            claim.userId ?? undefined,
            { signal: deadline.signal },
        );
        const settled = await settleConversationMemoryExtraction(claim, "succeeded");
        return settled ? "succeeded" : "lease_lost";
    } catch (error) {
        const settled = await settleConversationMemoryExtraction(claim, "failed", { error });
        logServerError("conversation-extractor", "durable memory extraction attempt failed", {
            runId: claim.runId,
            conversationId: claim.conversationId,
            failureRecorded: settled,
        }, error);
        return settled ? "failed" : "lease_lost";
    } finally {
        deadline.dispose();
    }
}

/** Process the current run first, then a bounded eligible backlog. */
export async function processConversationMemoryExtractionBacklog(options?: {
    preferredRunId?: string;
    limit?: number;
    now?: Date;
}): Promise<void> {
    const now = options?.now ?? new Date();
    const limit = Math.max(1, options?.limit ?? MEMORY_EXTRACTION_BACKLOG_BATCH_SIZE);
    const candidates = await prisma.agentRun.findMany({
        // Include expired processing rows at the cap so the worker can move
        // them from a stale processing marker to terminal failed/exhausted.
        where: eligibleMemoryExtractionWhere(now, { includeExhausted: true }),
        orderBy: [{ completedAt: "asc" }, { id: "asc" }],
        take: limit,
        select: { id: true },
    });
    const runIds = Array.from(new Set([
        ...(options?.preferredRunId ? [options.preferredRunId] : []),
        ...candidates.map((candidate) => candidate.id),
    ])).slice(0, limit);

    for (const runId of runIds) {
        await processConversationMemoryExtractionRun(runId, { now });
    }
}

/**
 * Register post-response work without making response finalization wait for
 * extraction. Failure to register is safe because the durable marker remains
 * eligible for a later run boundary.
 */
export function scheduleConversationMemoryExtractionAfterResponse(
    preferredRunId?: string,
): void {
    try {
        after(async () => {
            try {
                await processConversationMemoryExtractionBacklog({ preferredRunId });
            } catch (error) {
                logServerError("conversation-extractor", "memory extraction backlog processing failed", {
                    preferredRunId: preferredRunId ?? null,
                }, error);
            }
        });
    } catch (error) {
        logServerWarn("conversation-extractor", "memory extraction retry was not scheduled", {
            preferredRunId: preferredRunId ?? null,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
