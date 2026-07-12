import { beforeEach, describe, expect, it, vi } from "vitest";

type Reservation = {
    id: string;
    attemptKey: string;
    scopeKey: string;
    userId: string | null;
    workspaceId: string | null;
    projectId: string | null;
    conversationId: string | null;
    source: string;
    contextPage: string;
    provider: string;
    requestedModel: string;
    reservedTokens: number;
    status: string;
    actualModel: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    failureCode: string | null;
    createdAt: Date;
    updatedAt: Date;
    settledAt: Date | null;
};

type Usage = {
    id: string;
    reservationId: string | null;
    userId: string | null;
    workspaceId: string | null;
    projectId: string | null;
    conversationId: string | null;
    source: string;
    contextPage: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    createdAt: Date;
};

const config = vi.hoisted(() => ({
    maxRequestsPerMinute: 1,
    maxTokensPerDay: 1_000,
    maxTranscriptionsPerDay: 100,
}));

const mocks = vi.hoisted(() => ({
    transaction: vi.fn(),
    queryRaw: vi.fn(),
    reservationFindUnique: vi.fn(),
}));

vi.mock("@/lib/ai/config", () => ({ AI_CONFIG: config }));
vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $transaction: mocks.transaction,
        aIUsage: {
            count: vi.fn(),
            aggregate: vi.fn(),
            create: vi.fn(),
            findFirst: vi.fn(),
        },
        aIUsageReservation: {
            count: vi.fn(),
            aggregate: vi.fn(),
            create: vi.fn(),
            findUnique: mocks.reservationFindUnique,
            update: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

const {
    markUsageReservationReconcilable,
    reserveProviderUsageAttempt,
    settleUsageReservation,
    tryMarkUsageReservationReconcilable,
    trySettleUsageReservation,
} = await import("@/lib/server/ai/rate-limiter");

function input(estimatedTokens = 100, attemptKey = "attempt-1") {
    return {
        attemptKey,
        scope: {
            userId: "user-1",
            workspaceId: "workspace-1",
            projectId: "project-1",
        },
        provider: "openai",
        model: "gpt-5.2",
        estimatedTokens,
        source: "project_copilot",
        contextPage: "ledger",
        conversationId: "conv-1",
    };
}

describe("provider-attempt usage reservations", () => {
    let reservations: Reservation[];
    let usage: Usage[];

    beforeEach(() => {
        vi.clearAllMocks();
        config.maxRequestsPerMinute = 1;
        config.maxTokensPerDay = 1_000;
        reservations = [];
        usage = [];
        mocks.queryRaw.mockResolvedValue([]);
        mocks.reservationFindUnique.mockImplementation(
            async ({ where }: { where: { id?: string; attemptKey?: string } }) =>
                structuredClone(reservations.find((row) =>
                    (where.id ? row.id === where.id : row.attemptKey === where.attemptKey)
                ) ?? null),
        );

        const tx = {
            $queryRaw: mocks.queryRaw,
            aIUsage: {
                count: vi.fn(async ({ where }: { where: { reservationId?: null } }) =>
                    usage.filter((row) => where.reservationId !== null || row.reservationId === null).length
                ),
                aggregate: vi.fn(async () => ({
                    _sum: {
                        inputTokens: usage.reduce((sum, row) => sum + row.inputTokens, 0),
                        outputTokens: usage.reduce((sum, row) => sum + row.outputTokens, 0),
                    },
                })),
                create: vi.fn(async ({ data }: { data: Omit<Usage, "id"> }) => {
                    if (usage.some((row) => row.reservationId === data.reservationId)) {
                        throw Object.assign(new Error("duplicate reservation usage"), { code: "P2002" });
                    }
                    const row: Usage = {
                        id: `usage-${usage.length + 1}`,
                        ...data,
                    };
                    usage.push(row);
                    return structuredClone(row);
                }),
            },
            aIUsageReservation: {
                count: vi.fn(async ({ where }: {
                    where: { scopeKey: string; source?: string; createdAt?: { gte: Date } };
                }) => reservations.filter((row) =>
                    row.scopeKey === where.scopeKey
                    && (!where.source || row.source === where.source)
                    && (!where.createdAt || row.createdAt >= where.createdAt.gte)
                ).length),
                aggregate: vi.fn(async ({ where }: { where: { scopeKey: string; status: { not: string } } }) => ({
                    _sum: {
                        reservedTokens: reservations
                            .filter((row) => row.scopeKey === where.scopeKey && row.status !== where.status.not)
                            .reduce((sum, row) => sum + row.reservedTokens, 0),
                    },
                })),
                create: vi.fn(async ({ data }: { data: Omit<Reservation, "id" | "actualModel" | "inputTokens" | "outputTokens" | "failureCode" | "createdAt" | "updatedAt" | "settledAt"> }) => {
                    const now = new Date();
                    const row: Reservation = {
                        id: `reservation-${reservations.length + 1}`,
                        actualModel: null,
                        inputTokens: null,
                        outputTokens: null,
                        failureCode: null,
                        createdAt: now,
                        updatedAt: now,
                        settledAt: null,
                        ...data,
                    };
                    reservations.push(row);
                    return {
                        id: row.id,
                        reservedTokens: row.reservedTokens,
                        status: row.status,
                    };
                }),
                findUnique: vi.fn(async ({ where }: { where: { id?: string; attemptKey?: string } }) =>
                    structuredClone(reservations.find((row) =>
                        (where.id ? row.id === where.id : row.attemptKey === where.attemptKey)
                    ) ?? null)
                ),
                update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Reservation> }) => {
                    const row = reservations.find((candidate) => candidate.id === where.id);
                    if (!row) throw new Error("reservation not found");
                    Object.assign(row, data, { updatedAt: new Date() });
                    return structuredClone(row);
                }),
                updateMany: vi.fn(async ({ where, data }: {
                    where: { id: string; status: string };
                    data: Partial<Reservation>;
                }) => {
                    const row = reservations.find(
                        (candidate) => candidate.id === where.id && candidate.status === where.status,
                    );
                    if (!row) return { count: 0 };
                    Object.assign(row, data, { updatedAt: new Date() });
                    return { count: 1 };
                }),
            },
        };

        let transactionTail = Promise.resolve();
        mocks.transaction.mockImplementation(
            <T>(callback: (client: typeof tx) => Promise<T>) => {
                const result = transactionTail.then(() => callback(tx));
                transactionTail = result.then(() => undefined, () => undefined);
                return result;
            },
        );
    });

    it("serializes concurrent admission so the configured cap cannot be oversubscribed", async () => {
        const results = await Promise.allSettled([
            reserveProviderUsageAttempt(input(100, "attempt-1")),
            reserveProviderUsageAttempt({
                ...input(100, "attempt-2"),
                source: "voice_transcription",
            }),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected).toMatchObject({
            reason: expect.objectContaining({
                errorCode: "AI_RATE_LIMIT_EXCEEDED",
            }),
        });
        expect(reservations).toHaveLength(1);
    });

    it("counts a non-settled reservation against the conservative daily budget", async () => {
        config.maxRequestsPerMinute = 20;
        config.maxTokensPerDay = 150;
        await reserveProviderUsageAttempt(input(100));

        await expect(reserveProviderUsageAttempt(input(51, "attempt-2"))).rejects.toMatchObject({
            errorCode: "DAILY_TOKEN_LIMIT_EXCEEDED",
        });
        expect(reservations).toHaveLength(1);
        expect(reservations[0].status).toBe("active");
    });

    it("fails with a typed retryable timeout when admission never settles", async () => {
        mocks.transaction.mockReset();
        mocks.transaction.mockImplementation(() => new Promise(() => {}));

        await expect(
            reserveProviderUsageAttempt(input(), { deadlineMs: 5 }),
        ).rejects.toMatchObject({
            errorCode: "AI_USAGE_ADMISSION_TIMEOUT",
            errorMeta: expect.objectContaining({
                retryable: true,
                source: "usage_reservation",
            }),
        });
        expect(reservations).toHaveLength(0);
    });

    it("classifies a Prisma raw-query lock timeout as a typed admission timeout", async () => {
        mocks.transaction.mockReset();
        mocks.transaction.mockRejectedValue(Object.assign(new Error("Raw query failed"), {
            code: "P2010",
            meta: {
                code: "55P03",
                message: "canceling statement due to lock timeout",
            },
        }));

        await expect(reserveProviderUsageAttempt(input())).rejects.toMatchObject({
            errorCode: "AI_USAGE_ADMISSION_TIMEOUT",
            errorMeta: expect.objectContaining({ retryable: true }),
        });
    });

    it("reconciles a committed reservation after an ambiguous transaction rejection", async () => {
        const now = new Date();
        reservations.push({
            id: "reservation-committed",
            attemptKey: "attempt-ambiguous",
            scopeKey: "user:user-1:workspace:workspace-1",
            userId: "user-1",
            workspaceId: "workspace-1",
            projectId: "project-1",
            conversationId: "conv-1",
            source: "project_copilot",
            contextPage: "ledger",
            provider: "openai",
            requestedModel: "gpt-5.2",
            reservedTokens: 100,
            status: "active",
            actualModel: null,
            inputTokens: null,
            outputTokens: null,
            failureCode: null,
            createdAt: now,
            updatedAt: now,
            settledAt: null,
        });
        mocks.transaction.mockReset();
        mocks.transaction.mockRejectedValue(new Error("connection lost after commit"));

        await expect(reserveProviderUsageAttempt(
            input(100, "attempt-ambiguous"),
        )).resolves.toEqual({
            id: "reservation-committed",
            reservedTokens: 100,
            status: "active",
        });
        expect(reservations).toHaveLength(1);
    });

    it("settles exactly once even when the same reservation is reconciled concurrently", async () => {
        config.maxRequestsPerMinute = 20;
        const reservation = await reserveProviderUsageAttempt(input());

        const results = await Promise.all([
            settleUsageReservation({
                reservationId: reservation.id,
                model: "gpt-5.2",
                inputTokens: 40,
                outputTokens: 10,
            }),
            settleUsageReservation({
                reservationId: reservation.id,
                model: "gpt-5.2",
                inputTokens: 40,
                outputTokens: 10,
            }),
        ]);

        expect(results).toEqual([{ settledNow: true }, { settledNow: false }]);
        expect(usage).toHaveLength(1);
        expect(usage[0]).toMatchObject({
            reservationId: reservation.id,
            inputTokens: 40,
            outputTokens: 10,
        });
        expect(reservations[0]).toMatchObject({
            status: "settled",
            actualModel: "gpt-5.2",
            inputTokens: 40,
            outputTokens: 10,
        });
    });

    it("uses the reservation day for settled usage and takes the shared scope lock first", async () => {
        config.maxRequestsPerMinute = 20;
        const reservation = await reserveProviderUsageAttempt(input());
        const admissionDay = new Date("2026-07-11T23:59:59.000Z");
        reservations[0].createdAt = admissionDay;
        mocks.queryRaw.mockClear();

        await settleUsageReservation({
            reservationId: reservation.id,
            model: "gpt-5.2",
            inputTokens: 1,
            outputTokens: 1,
        });

        expect(usage[0].createdAt).toEqual(admissionDay);
        const interpolatedLockKeys = mocks.queryRaw.mock.calls
            .flatMap((call) => call.slice(1))
            .filter((value): value is string => typeof value === "string");
        expect(interpolatedLockKeys).toEqual([
            "ai-usage-admission:user:user-1:workspace:workspace-1",
            `ai-usage-settle:${reservation.id}`,
        ]);
    });

    it("keeps failed attempts reconcilable and lets a later authoritative usage settle them", async () => {
        config.maxRequestsPerMinute = 20;
        const reservation = await reserveProviderUsageAttempt(input());
        await markUsageReservationReconcilable(
            reservation.id,
            "failed",
            "UPSTREAM_503",
        );
        expect(reservations[0]).toMatchObject({
            status: "failed",
            failureCode: "UPSTREAM_503",
        });

        await settleUsageReservation({
            reservationId: reservation.id,
            model: "gpt-5.2",
            inputTokens: 12,
            outputTokens: 3,
        });
        expect(reservations[0].status).toBe("settled");
        expect(usage).toHaveLength(1);
    });

    it("bounds rejected and non-settling settlement and outcome writes", async () => {
        mocks.transaction.mockReset();
        mocks.transaction.mockRejectedValueOnce(new Error("database rejected"));
        await expect(trySettleUsageReservation({
            reservationId: "reservation-1",
            model: "gpt-5.2",
            inputTokens: 1,
            outputTokens: 1,
        }, { deadlineMs: 5 })).resolves.toBe(false);

        mocks.transaction.mockImplementation(() => new Promise(() => {}));
        await expect(trySettleUsageReservation({
            reservationId: "reservation-1",
            model: "gpt-5.2",
            inputTokens: 1,
            outputTokens: 1,
        }, { deadlineMs: 5 })).resolves.toBe(false);
        await expect(tryMarkUsageReservationReconcilable(
            "reservation-1",
            "unknown",
            "NO_TERMINAL_USAGE",
            { deadlineMs: 5 },
        )).resolves.toBe(false);
    });
});
