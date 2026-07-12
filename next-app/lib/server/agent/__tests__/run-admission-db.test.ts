/**
 * Real-Postgres proof for conversation-scoped agent-run admission.
 *
 * This file is deliberately opt-in and refuses to touch a non-loopback DB.
 * Run with:
 *   RUN_DB_TESTS=1 npx vitest run lib/server/agent/__tests__/run-admission-db.test.ts
 */

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const runDbTests = process.env.RUN_DB_TESTS === "1";

function isLoopbackDatabaseUrl(rawUrl: string | undefined): boolean {
    if (!rawUrl) return false;
    try {
        const hostname = new URL(rawUrl).hostname.toLowerCase();
        return hostname === "localhost"
            || hostname === "127.0.0.1"
            || hostname === "::1"
            || hostname === "[::1]";
    } catch {
        return false;
    }
}

const hasSafeLocalTarget = isLoopbackDatabaseUrl(process.env.DATABASE_URL)
    && process.env.NODE_ENV !== "production";
const shouldRun = runDbTests && hasSafeLocalTarget;

let prisma: typeof import("@/lib/server/prisma").prisma;
let startRun: typeof import("@/lib/server/agent/run").startRun;
const createdConversationIds = new Set<string>();

describe.runIf(runDbTests && !hasSafeLocalTarget)("Agent run admission DB target guard", () => {
    it("refuses to run against a non-loopback or production database", () => {
        throw new Error(
            "RUN_DB_TESTS=1 requires a loopback DATABASE_URL and a non-production NODE_ENV.",
        );
    });
});

describe.skipIf(!shouldRun)("Agent run admission (real Postgres)", () => {
    afterEach(async () => {
        if (!prisma || createdConversationIds.size === 0) return;
        const conversationIds = [...createdConversationIds];
        await prisma.agentRun.deleteMany({
            where: { conversationId: { in: conversationIds } },
        });
        createdConversationIds.clear();
    });

    afterAll(async () => {
        if (prisma) {
            await prisma.$disconnect();
        }
    });

    it("serializes simultaneous starts so exactly one active run is admitted", async () => {
        const prismaModule = await import("@/lib/server/prisma");
        const runModule = await import("@/lib/server/agent/run");
        prisma = prismaModule.prisma;
        startRun = runModule.startRun;

        const conversationId = `db-test-run-admission-${randomUUID()}`;
        createdConversationIds.add(conversationId);

        let signalLockAcquired: (() => void) | undefined;
        const lockAcquired = new Promise<void>((resolve) => {
            signalLockAcquired = resolve;
        });
        let releaseLock: (() => void) | undefined;
        const holdLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        const blocker = prisma.$transaction(async (tx) => {
            await tx.$queryRaw<{ locked: number }[]>`
                SELECT 1 AS locked
                FROM pg_advisory_xact_lock(
                    hashtext(${`conversation-run-admission:${conversationId}`})
                )
            `;
            signalLockAcquired?.();
            await holdLock;
        }, { maxWait: 5_000, timeout: 10_000 });

        await lockAcquired;

        let settledCount = 0;
        const attempts = [
            startRun({
                conversationId,
                trigger: "user_message",
                agentMode: "general",
                model: "db-concurrency-proof",
            }),
            startRun({
                conversationId,
                trigger: "user_message",
                agentMode: "general",
                model: "db-concurrency-proof",
            }),
        ].map((attempt) => attempt.then(
            (value) => ({ status: "fulfilled" as const, value }),
            (reason: unknown) => ({ status: "rejected" as const, reason }),
        ).finally(() => {
            settledCount += 1;
        }));

        try {
            await new Promise((resolve) => setTimeout(resolve, 75));
            expect(settledCount).toBe(0);
        } finally {
            releaseLock?.();
        }

        await blocker;
        const results = await Promise.all(attempts);
        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]).toMatchObject({
            reason: expect.objectContaining({
                errorCode: "ACTIVE_RUN_EXISTS",
            }),
        });

        const persistedRuns = await prisma.agentRun.findMany({
            where: { conversationId },
            select: { id: true, status: true, completedAt: true },
        });
        expect(persistedRuns).toEqual([
            expect.objectContaining({
                status: "running",
                completedAt: null,
            }),
        ]);
    }, 15_000);
});
