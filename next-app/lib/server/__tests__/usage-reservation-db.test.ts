/**
 * Real-Postgres proof for provider-attempt quota admission.
 *
 * This file is deliberately opt-in and refuses to touch a non-loopback DB.
 * Run with:
 *   RUN_DB_TESTS=1 npx vitest run lib/server/__tests__/usage-reservation-db.test.ts
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
let reserveProviderUsageAttempt:
    typeof import("@/lib/server/ai/rate-limiter").reserveProviderUsageAttempt;
let settleUsageReservation:
    typeof import("@/lib/server/ai/rate-limiter").settleUsageReservation;
let aiConfig: { maxRequestsPerMinute: number; maxTokensPerDay: number };
let originalRequestLimit: number | undefined;
let originalDailyTokenLimit: number | undefined;
const createdUserIds = new Set<string>();

describe.runIf(runDbTests && !hasSafeLocalTarget)("Usage reservation DB target guard", () => {
    it("refuses to run against a non-loopback or production database", () => {
        throw new Error(
            "RUN_DB_TESTS=1 requires a loopback DATABASE_URL and a non-production NODE_ENV.",
        );
    });
});

describe.skipIf(!shouldRun)("Usage reservation admission (real Postgres)", () => {
    afterEach(async () => {
        if (aiConfig && originalRequestLimit !== undefined) {
            aiConfig.maxRequestsPerMinute = originalRequestLimit;
        }
        if (aiConfig && originalDailyTokenLimit !== undefined) {
            aiConfig.maxTokensPerDay = originalDailyTokenLimit;
        }
        if (!prisma || createdUserIds.size === 0) return;
        await prisma.aIUsage.deleteMany({
            where: { userId: { in: [...createdUserIds] } },
        });
        await prisma.aIUsageReservation.deleteMany({
            where: { userId: { in: [...createdUserIds] } },
        });
        createdUserIds.clear();
    });

    afterAll(async () => {
        if (prisma) await prisma.$disconnect();
    });

    it("serializes simultaneous admissions so exactly one attempt gets the final slot", async () => {
        const prismaModule = await import("@/lib/server/prisma");
        const limiterModule = await import("@/lib/server/ai/rate-limiter");
        const configModule = await import("@/lib/ai/config");
        prisma = prismaModule.prisma;
        reserveProviderUsageAttempt = limiterModule.reserveProviderUsageAttempt;
        settleUsageReservation = limiterModule.settleUsageReservation;
        aiConfig = configModule.AI_CONFIG as unknown as {
            maxRequestsPerMinute: number;
            maxTokensPerDay: number;
        };
        originalRequestLimit = aiConfig.maxRequestsPerMinute;
        originalDailyTokenLimit = aiConfig.maxTokensPerDay;
        aiConfig.maxRequestsPerMinute = 1;

        const userId = `db-test-usage-${randomUUID()}`;
        createdUserIds.add(userId);
        const attemptInput = {
            scope: {
                userId,
                workspaceId: `workspace-${randomUUID()}`,
                projectId: null,
            },
            provider: "db-concurrency-proof",
            model: "db-concurrency-proof",
            estimatedTokens: 1,
            source: "ai_page",
            contextPage: "ai",
            conversationId: null,
        };

        const firstAttemptKey = `db-attempt-${randomUUID()}`;
        const secondAttemptKey = `db-attempt-${randomUUID()}`;
        const results = await Promise.allSettled([
            reserveProviderUsageAttempt({
                ...attemptInput,
                attemptKey: firstAttemptKey,
            }),
            reserveProviderUsageAttempt({
                ...attemptInput,
                attemptKey: secondAttemptKey,
                source: "voice_transcription",
            }),
        ]);

        const fulfilled = results.filter(
            (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof reserveProviderUsageAttempt>>> =>
                result.status === "fulfilled",
        );
        expect(fulfilled).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected).toMatchObject({
            reason: expect.objectContaining({
                errorCode: "AI_RATE_LIMIT_EXCEEDED",
            }),
        });

        const persisted = await prisma.aIUsageReservation.findMany({
            where: { userId },
            select: { id: true, status: true, reservedTokens: true },
        });
        expect(persisted).toEqual([
            expect.objectContaining({
                status: "active",
                reservedTokens: 1,
            }),
        ]);

        const settlementResults = await Promise.all([
            settleUsageReservation({
                reservationId: fulfilled[0].value.id,
                model: "db-concurrency-proof",
                inputTokens: 1,
                outputTokens: 1,
            }),
            settleUsageReservation({
                reservationId: fulfilled[0].value.id,
                model: "db-concurrency-proof",
                inputTokens: 1,
                outputTokens: 1,
            }),
        ]);
        expect(settlementResults).toEqual(
            expect.arrayContaining([{ settledNow: true }, { settledNow: false }]),
        );
        expect(await prisma.aIUsage.count({
            where: { reservationId: fulfilled[0].value.id },
        })).toBe(1);
    }, 15_000);

    it("serializes settlement with admission so token accounting cannot disappear between queries", async () => {
        const prismaModule = await import("@/lib/server/prisma");
        const limiterModule = await import("@/lib/server/ai/rate-limiter");
        const configModule = await import("@/lib/ai/config");
        prisma = prismaModule.prisma;
        reserveProviderUsageAttempt = limiterModule.reserveProviderUsageAttempt;
        settleUsageReservation = limiterModule.settleUsageReservation;
        aiConfig = configModule.AI_CONFIG as unknown as {
            maxRequestsPerMinute: number;
            maxTokensPerDay: number;
        };
        originalRequestLimit = aiConfig.maxRequestsPerMinute;
        originalDailyTokenLimit = aiConfig.maxTokensPerDay;
        aiConfig.maxRequestsPerMinute = 20;
        aiConfig.maxTokensPerDay = 2;

        for (let index = 0; index < 10; index += 1) {
            const userId = `db-test-settle-admit-${randomUUID()}`;
            createdUserIds.add(userId);
            const scope = {
                userId,
                workspaceId: `workspace-${randomUUID()}`,
                projectId: null,
            };
            const existing = await reserveProviderUsageAttempt({
                attemptKey: `db-existing-${randomUUID()}`,
                scope,
                provider: "db-settle-admit-proof",
                model: "db-settle-admit-proof",
                estimatedTokens: 2,
                source: "ai_page",
                contextPage: "ai",
            });

            const concurrent = await Promise.allSettled([
                settleUsageReservation({
                    reservationId: existing.id,
                    model: "db-settle-admit-proof",
                    inputTokens: 2,
                    outputTokens: 0,
                }),
                reserveProviderUsageAttempt({
                    attemptKey: `db-new-${randomUUID()}`,
                    scope,
                    provider: "db-settle-admit-proof",
                    model: "db-settle-admit-proof",
                    estimatedTokens: 1,
                    source: "voice_transcription",
                    contextPage: "ai",
                }),
            ]);

            expect(concurrent[0]).toMatchObject({ status: "fulfilled" });
            expect(concurrent[1]).toMatchObject({
                status: "rejected",
                reason: expect.objectContaining({
                    errorCode: "DAILY_TOKEN_LIMIT_EXCEEDED",
                }),
            });
        }
    }, 20_000);
});
