/**
 * Real-Postgres proof for durable conversation-memory extraction markers.
 *
 * This file is opt-in and refuses non-loopback targets. Run with:
 *   RUN_DB_TESTS=1 npx vitest run lib/server/__tests__/conversation-extraction-jobs.db.test.ts
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
const createdUserIds = new Set<string>();

describe.runIf(runDbTests && !hasSafeLocalTarget)("Memory extraction DB target guard", () => {
    it("refuses to run against a non-loopback or production database", () => {
        throw new Error(
            "RUN_DB_TESTS=1 requires a loopback DATABASE_URL and a non-production NODE_ENV.",
        );
    });
});

describe.skipIf(!shouldRun)("Conversation memory extraction jobs (real Postgres)", () => {
    afterEach(async () => {
        if (!prisma || createdUserIds.size === 0) return;
        const userIds = [...createdUserIds];
        await prisma.project.deleteMany({ where: { ownerId: { in: userIds } } });
        await prisma.workspace.deleteMany({
            where: { name: { startsWith: "memory-extraction-db-test-" } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        createdUserIds.clear();
    });

    afterAll(async () => {
        if (prisma) await prisma.$disconnect();
    });

    it("atomically queues completion, reclaims an expired lease, and retries failed state once", async () => {
        const prismaModule = await import("@/lib/server/prisma");
        const runModule = await import("@/lib/server/agent/run");
        const jobsModule = await import("@/lib/server/memory/conversation-extraction-jobs");
        prisma = prismaModule.prisma;

        const suffix = randomUUID();
        const userId = `memory-extraction-user-${suffix}`;
        createdUserIds.add(userId);
        const user = await prisma.user.create({
            data: {
                id: userId,
                email: `memory-extraction-${suffix}@example.test`,
                name: "Memory Extraction DB Test",
            },
        });
        const workspace = await prisma.workspace.create({
            data: { name: `memory-extraction-db-test-${suffix}` },
        });
        const project = await prisma.project.create({
            data: {
                workspaceId: workspace.id,
                ownerId: user.id,
                name: "Memory Extraction DB Test",
                status: "active",
                statusText: "Active",
            },
        });
        const conversation = await prisma.aIConversation.create({
            data: {
                userId: user.id,
                workspaceId: workspace.id,
                projectId: project.id,
                context: "project",
            },
        });
        const run = await runModule.startRun({
            projectId: project.id,
            conversationId: conversation.id,
            userId: user.id,
            trigger: "user_message",
            agentMode: "general",
        });

        await runModule.endRun(run.id, "completed");
        await expect(prisma.agentRun.findUnique({
            where: { id: run.id },
            select: { status: true, memoryExtractionStatus: true },
        })).resolves.toEqual({
            status: "completed",
            memoryExtractionStatus: "pending",
        });

        await prisma.agentRun.update({
            where: { id: run.id },
            data: {
                memoryExtractionStatus: "processing",
                memoryExtractionAttempts: 1,
                memoryExtractionLeaseToken: "expired-worker",
                memoryExtractionLeaseExpiresAt: new Date(Date.now() - 1_000),
            },
        });
        await expect(
            jobsModule.processConversationMemoryExtractionRun(run.id),
        ).resolves.toBe("skipped");

        await prisma.agentRun.update({
            where: { id: run.id },
            data: {
                memoryExtractionStatus: "failed",
                memoryExtractionAttempts: 2,
                memoryExtractionCompletedAt: null,
                memoryExtractionLastError: "synthetic failure",
            },
        });
        await expect(
            jobsModule.processConversationMemoryExtractionRun(run.id),
        ).resolves.toBe("skipped");
        await expect(
            jobsModule.processConversationMemoryExtractionRun(run.id),
        ).resolves.toBe("not_claimed");

        await prisma.agentRun.update({
            where: { id: run.id },
            data: {
                memoryExtractionStatus: "processing",
                memoryExtractionAttempts: jobsModule.MEMORY_EXTRACTION_MAX_ATTEMPTS,
                memoryExtractionLeaseToken: "exhausted-worker",
                memoryExtractionLeaseExpiresAt: new Date(Date.now() - 1_000),
            },
        });
        await expect(
            jobsModule.processConversationMemoryExtractionRun(run.id),
        ).resolves.toBe("exhausted");

        await expect(prisma.agentRun.findUnique({
            where: { id: run.id },
            select: {
                memoryExtractionStatus: true,
                memoryExtractionAttempts: true,
                memoryExtractionLeaseToken: true,
                memoryExtractionLeaseExpiresAt: true,
                memoryExtractionLastError: true,
            },
        })).resolves.toEqual({
            memoryExtractionStatus: "failed",
            memoryExtractionAttempts: jobsModule.MEMORY_EXTRACTION_MAX_ATTEMPTS,
            memoryExtractionLeaseToken: null,
            memoryExtractionLeaseExpiresAt: null,
            memoryExtractionLastError: "Memory extraction retry limit exhausted.",
        });
    }, 20_000);
});
