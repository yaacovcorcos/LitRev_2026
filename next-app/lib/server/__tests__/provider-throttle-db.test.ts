/**
 * Real-Postgres proof for cross-instance search-provider reservations.
 *
 * Run with:
 *   RUN_DB_TESTS=1 npx vitest run lib/server/__tests__/provider-throttle-db.test.ts
 */

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

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

describe.runIf(runDbTests && !hasSafeLocalTarget)("Search provider throttle DB target guard", () => {
    it("refuses to run against a non-loopback or production database", () => {
        throw new Error(
            "RUN_DB_TESTS=1 requires a loopback DATABASE_URL and a non-production NODE_ENV.",
        );
    });
});

describe.skipIf(!shouldRun)("Search provider throttle (real Postgres)", () => {
    afterAll(async () => {
        if (prisma) await prisma.$disconnect();
    });

    it("atomically assigns non-overlapping slots to simultaneous instances", async () => {
        const prismaModule = await import("@/lib/server/prisma");
        const throttleModule = await import("@/lib/server/search/provider-throttle");
        prisma = prismaModule.prisma;
        const providerKey = `db-test:${randomUUID()}`;
        const intervalMs = 150;

        try {
            const reservations = await Promise.all([
                throttleModule.prismaSearchProviderThrottleStore.reserve(providerKey, intervalMs, 10_000),
                throttleModule.prismaSearchProviderThrottleStore.reserve(providerKey, intervalMs, 10_000),
                throttleModule.prismaSearchProviderThrottleStore.reserve(providerKey, intervalMs, 10_000),
            ]);
            const reservedTimes = reservations
                .map(({ reservedAt }) => reservedAt.getTime())
                .sort((a, b) => a - b);

            expect(reservedTimes[1] - reservedTimes[0]).toBeGreaterThanOrEqual(intervalMs - 2);
            expect(reservedTimes[2] - reservedTimes[1]).toBeGreaterThanOrEqual(intervalMs - 2);
        } finally {
            await prisma.searchProviderThrottle.deleteMany({ where: { providerKey } });
        }
    }, 10_000);

    it("refuses to advance a provider cursor beyond the bounded queue horizon", async () => {
        const prismaModule = await import("@/lib/server/prisma");
        const throttleModule = await import("@/lib/server/search/provider-throttle");
        prisma = prismaModule.prisma;
        const providerKey = `db-test-horizon:${randomUUID()}`;
        const originalNextAvailableAt = new Date(Date.now() + 60_000);
        await prisma.searchProviderThrottle.create({
            data: { providerKey, nextAvailableAt: originalNextAvailableAt },
        });

        try {
            await expect(throttleModule.prismaSearchProviderThrottleStore.reserve(
                providerKey,
                150,
                100,
            )).rejects.toMatchObject({ code: "SEARCH_PROVIDER_THROTTLE_BUSY" });
            const persisted = await prisma.searchProviderThrottle.findUniqueOrThrow({
                where: { providerKey },
                select: { nextAvailableAt: true },
            });
            expect(persisted.nextAvailableAt.getTime()).toBe(originalNextAvailableAt.getTime());
        } finally {
            await prisma.searchProviderThrottle.deleteMany({ where: { providerKey } });
        }
    }, 10_000);

    it("marks pre-cooldown reservations stale and spaces their replacements", async () => {
        const prismaModule = await import("@/lib/server/prisma");
        const throttleModule = await import("@/lib/server/search/provider-throttle");
        prisma = prismaModule.prisma;
        const providerKey = `db-test-cooldown:${randomUUID()}`;
        const intervalMs = 150;

        try {
            const staleReservation = await throttleModule.prismaSearchProviderThrottleStore.reserve(
                providerKey,
                intervalMs,
                10_000,
            );
            await throttleModule.prismaSearchProviderThrottleStore.defer(providerKey, 500);
            const cooldown = await throttleModule.prismaSearchProviderThrottleStore.readCooldown(providerKey);
            const replacement = await throttleModule.prismaSearchProviderThrottleStore.reserve(
                providerKey,
                intervalMs,
                10_000,
            );

            expect(cooldown.cooldownUntil).not.toBeNull();
            expect(cooldown.cooldownUntil!.getTime()).toBeGreaterThan(
                staleReservation.reservedAt.getTime(),
            );
            expect(replacement.reservedAt.getTime()).toBeGreaterThanOrEqual(
                cooldown.cooldownUntil!.getTime() - 2,
            );
        } finally {
            await prisma.searchProviderThrottle.deleteMany({ where: { providerKey } });
        }
    }, 10_000);
});
