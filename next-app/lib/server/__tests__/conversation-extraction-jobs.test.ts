import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    agentRunUpdateMany: vi.fn(),
    agentRunFindUnique: vi.fn(),
    agentRunFindMany: vi.fn(),
    aiMessageCount: vi.fn(),
    extractMemoriesFromConversation: vi.fn(),
    after: vi.fn(),
    logServerError: vi.fn(),
    logServerWarn: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        agentRun: {
            updateMany: mocks.agentRunUpdateMany,
            findUnique: mocks.agentRunFindUnique,
            findMany: mocks.agentRunFindMany,
        },
        aIMessage: { count: mocks.aiMessageCount },
    },
}));

vi.mock("@/lib/server/memory/conversation-extractor", () => ({
    extractMemoriesFromConversation: mocks.extractMemoriesFromConversation,
}));

vi.mock("@/lib/server/logging", () => ({
    logServerError: mocks.logServerError,
    logServerWarn: mocks.logServerWarn,
}));

const {
    MEMORY_EXTRACTION_DEADLINE_MS,
    MEMORY_EXTRACTION_LEASE_MS,
    MEMORY_EXTRACTION_MAX_ATTEMPTS,
    processConversationMemoryExtractionBacklog,
    processConversationMemoryExtractionRun,
    scheduleConversationMemoryExtractionAfterResponse,
} = await import("@/lib/server/memory/conversation-extraction-jobs");

function latestClaimToken(): string {
    const claimCall = [...mocks.agentRunUpdateMany.mock.calls]
        .reverse()
        .find((call) => call[0]?.data?.memoryExtractionStatus === "processing");
    return claimCall?.[0]?.data?.memoryExtractionLeaseToken as string;
}

function mockClaimedRun(runId = "run-1") {
    mocks.agentRunFindUnique.mockImplementation(async () => ({
        id: runId,
        conversationId: "conv-1",
        projectId: "project-1",
        userId: "user-1",
        memoryExtractionStatus: "processing",
        memoryExtractionLeaseToken: latestClaimToken(),
    }));
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.after.mockImplementation(() => undefined);
    mocks.agentRunFindMany.mockResolvedValue([]);
    mocks.aiMessageCount.mockResolvedValue(6);
    mocks.extractMemoriesFromConversation.mockResolvedValue({
        decisions: [],
        preferences: [],
        facts: [],
    });
    mockClaimedRun();
});

describe("durable conversation memory extraction", () => {
    it("bounds provider work well inside the durable lease", () => {
        expect(MEMORY_EXTRACTION_DEADLINE_MS).toBeLessThan(MEMORY_EXTRACTION_LEASE_MS);
    });

    it("aborts a hung extraction at the job deadline and records a retryable failure", async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        let processing: Promise<unknown> | undefined;
        try {
            mocks.agentRunUpdateMany
                .mockResolvedValueOnce({ count: 1 })
                .mockResolvedValueOnce({ count: 1 });
            mocks.extractMemoriesFromConversation.mockImplementationOnce(
                async (_conversationId, _projectId, _runId, _userId, options) =>
                    new Promise((_resolve, reject) => {
                        options?.signal?.addEventListener("abort", () => {
                            const error = new Error("aborted");
                            error.name = "AbortError";
                            reject(error);
                        }, { once: true });
                    }),
            );

            processing = processConversationMemoryExtractionRun("run-1", {
                signal: controller.signal,
            });
            await vi.waitFor(
                () => expect(mocks.extractMemoriesFromConversation).toHaveBeenCalledTimes(1),
                { interval: 1, timeout: 100 },
            );

            await vi.advanceTimersByTimeAsync(MEMORY_EXTRACTION_DEADLINE_MS);
            await expect(processing).resolves.toBe("failed");
            expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
                data: expect.objectContaining({
                    memoryExtractionStatus: "failed",
                    memoryExtractionLastError: "aborted",
                }),
            }));
        } finally {
            controller.abort();
            await processing?.catch(() => undefined);
            vi.useRealTimers();
        }
    });

    it("reclaims an expired processing lease with a fresh fenced token", async () => {
        const now = new Date("2026-07-12T20:00:00.000Z");
        mocks.agentRunUpdateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });

        await expect(
            processConversationMemoryExtractionRun("run-1", { now }),
        ).resolves.toBe("succeeded");

        const claim = mocks.agentRunUpdateMany.mock.calls[0]![0];
        expect(claim.where).toEqual(expect.objectContaining({
            id: "run-1",
            OR: expect.arrayContaining([
                expect.objectContaining({
                    memoryExtractionStatus: "processing",
                    OR: expect.arrayContaining([
                        { memoryExtractionLeaseExpiresAt: { lte: now } },
                    ]),
                }),
            ]),
        }));
        expect(claim.data).toEqual(expect.objectContaining({
            memoryExtractionStatus: "processing",
            memoryExtractionAttempts: { increment: 1 },
            memoryExtractionLeaseToken: expect.any(String),
            memoryExtractionLeaseExpiresAt: new Date(now.getTime() + MEMORY_EXTRACTION_LEASE_MS),
        }));
    });

    it("settles success idempotently and never extracts twice for one run", async () => {
        mocks.agentRunUpdateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 0 });

        await expect(processConversationMemoryExtractionRun("run-1")).resolves.toBe("succeeded");
        await expect(processConversationMemoryExtractionRun("run-1")).resolves.toBe("not_claimed");

        expect(mocks.extractMemoriesFromConversation).toHaveBeenCalledTimes(1);
        expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
            where: expect.objectContaining({
                id: "run-1",
                memoryExtractionStatus: "processing",
                memoryExtractionLeaseToken: expect.any(String),
            }),
            data: expect.objectContaining({
                memoryExtractionStatus: "succeeded",
                memoryExtractionCompletedAt: expect.any(Date),
                memoryExtractionLeaseToken: null,
                memoryExtractionLeaseExpiresAt: null,
            }),
        }));
    });

    it("terminalizes an expired processing lease that exhausted its retry cap", async () => {
        const now = new Date("2026-07-12T20:00:00.000Z");
        mocks.agentRunUpdateMany
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 1 });

        await expect(
            processConversationMemoryExtractionRun("run-1", { now }),
        ).resolves.toBe("exhausted");

        expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
            where: expect.objectContaining({
                OR: expect.arrayContaining([
                    expect.objectContaining({
                        memoryExtractionStatus: "processing",
                        memoryExtractionAttempts: { lt: MEMORY_EXTRACTION_MAX_ATTEMPTS },
                    }),
                ]),
            }),
        }));
        expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(2, {
            where: expect.objectContaining({
                id: "run-1",
                memoryExtractionAttempts: { gte: MEMORY_EXTRACTION_MAX_ATTEMPTS },
                OR: expect.arrayContaining([
                    expect.objectContaining({ memoryExtractionStatus: "processing" }),
                ]),
            }),
            data: {
                memoryExtractionStatus: "failed",
                memoryExtractionLeaseToken: null,
                memoryExtractionLeaseExpiresAt: null,
                memoryExtractionCompletedAt: null,
                memoryExtractionLastError: "Memory extraction retry limit exhausted.",
            },
        });
        expect(mocks.extractMemoriesFromConversation).not.toHaveBeenCalled();
    });

    it("records failure and succeeds on a later retry without duplicate settlement", async () => {
        mocks.agentRunUpdateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
        mocks.extractMemoriesFromConversation
            .mockRejectedValueOnce(new Error("provider timeout"))
            .mockResolvedValueOnce({ decisions: [], preferences: [], facts: [] });

        await expect(processConversationMemoryExtractionRun("run-1")).resolves.toBe("failed");
        await expect(processConversationMemoryExtractionRun("run-1")).resolves.toBe("succeeded");

        expect(mocks.extractMemoriesFromConversation).toHaveBeenCalledTimes(2);
        expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
            data: expect.objectContaining({
                memoryExtractionStatus: "failed",
                memoryExtractionLastError: "provider timeout",
            }),
        }));
        expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(4, expect.objectContaining({
            data: expect.objectContaining({
                memoryExtractionStatus: "succeeded",
                memoryExtractionLastError: null,
            }),
        }));
    });

    it("marks short conversations skipped without invoking the model", async () => {
        mocks.agentRunUpdateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
        mocks.aiMessageCount.mockResolvedValue(4);

        await expect(processConversationMemoryExtractionRun("run-1")).resolves.toBe("skipped");

        expect(mocks.extractMemoriesFromConversation).not.toHaveBeenCalled();
        expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
            data: expect.objectContaining({ memoryExtractionStatus: "skipped" }),
        }));
    });

    it("retries an eligible failed backlog marker at a later run boundary", async () => {
        mocks.agentRunFindMany.mockResolvedValue([{ id: "run-old" }]);
        mocks.agentRunUpdateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
        mockClaimedRun("run-old");

        await processConversationMemoryExtractionBacklog({
            now: new Date("2026-07-12T20:00:00.000Z"),
        });

        expect(mocks.agentRunFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                OR: expect.arrayContaining([
                    expect.objectContaining({ memoryExtractionStatus: "failed" }),
                ]),
            }),
        }));
        expect(mocks.extractMemoriesFromConversation).toHaveBeenCalledWith(
            "conv-1",
            "project-1",
            "run-old",
            "user-1",
            { signal: expect.any(AbortSignal) },
        );
    });

    it("uses after only as an accelerator and swallows registration failure", () => {
        mocks.after.mockImplementationOnce(() => {
            throw new Error("no request scope");
        });

        expect(() => scheduleConversationMemoryExtractionAfterResponse("run-1")).not.toThrow();
        expect(mocks.agentRunFindMany).not.toHaveBeenCalled();
        expect(mocks.logServerWarn).toHaveBeenCalledWith(
            "conversation-extractor",
            "memory extraction retry was not scheduled",
            expect.objectContaining({ preferredRunId: "run-1" }),
        );
    });
});
