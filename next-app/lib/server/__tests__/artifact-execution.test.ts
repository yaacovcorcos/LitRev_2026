import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    transaction: vi.fn(),
    emitEvent: vi.fn(),
    emitPostRunUserEvent: vi.fn(),
    createCheckpoint: vi.fn(),
    markDurabilityDegraded: vi.fn(),
    logError: vi.fn(),
    logWarn: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: { $transaction: mocks.transaction },
}));

vi.mock("@/lib/server/agent/events", () => ({
    emitEventWithinTransaction: mocks.emitEvent,
    emitPostRunUserEventWithinTransaction: mocks.emitPostRunUserEvent,
}));

vi.mock("@/lib/server/agent/run-checkpoints", () => ({
    createArtifactCheckpointInTransaction: mocks.createCheckpoint,
}));

vi.mock("@/lib/server/agent/run", () => ({
    markRunDurabilityDegraded: mocks.markDurabilityDegraded,
}));

vi.mock("@/lib/server/memory/protocol-sync", () => ({
    syncProtocolToMemory: vi.fn(),
}));

vi.mock("@/lib/server/logging", () => ({
    logServerError: mocks.logError,
    logServerWarn: mocks.logWarn,
}));

vi.mock("@/types/artifacts", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/types/artifacts")>();
    return { ...original, ARTIFACT_PAYLOAD_SCHEMAS: {} };
});

vi.mock("@prisma/client", () => ({
    Prisma: { DbNull: "DbNull" },
}));

const { runArtifactApplyTransaction } = await import("@/lib/server/agent/artifact-execution");

function makeArtifact() {
    return {
        id: "artifact-1",
        runId: "run-1",
        projectId: "project-1",
        conversationId: "conversation-1",
        userId: "user-1",
        type: "draft_diff",
        status: "proposed",
        title: "Draft update",
        payload: {},
        snapshot: null,
        version: 1,
        sourceEventId: null,
        applyId: null,
        appliedAt: null,
        appliedByUserId: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: new Date("2026-07-12T00:00:00.000Z"),
        project: { ownerId: "owner-1", workspaceId: "workspace-1" },
    };
}

describe("artifact execution transaction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("locks before reloading state and records manual review as a post-run user event", async () => {
        const callOrder: string[] = [];
        const artifact = makeArtifact();
        const tx = {
            $queryRaw: vi.fn(async () => {
                callOrder.push("lock");
                return [{ locked: 1 }];
            }),
            artifact: {
                findUnique: vi.fn(async () => {
                    callOrder.push("load");
                    return artifact;
                }),
                update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
                    ...artifact,
                    ...data,
                    status: "accepted",
                })),
            },
        };
        mocks.transaction.mockImplementation(async (callback) => callback(tx));
        mocks.emitPostRunUserEvent.mockResolvedValue({
            sequence: 8,
            createdAt: new Date("2026-07-12T00:00:01.000Z"),
        });
        mocks.createCheckpoint.mockResolvedValue(undefined);

        const result = await runArtifactApplyTransaction({
            artifactId: artifact.id,
            executionSource: "manual_review",
            statusOverride: "accepted",
            actorUserId: "reviewer-1",
        }, {
            applyFunctions: new Map(),
            snapshotReaders: new Map(),
            appliedStateReaders: new Map(),
        });

        expect(callOrder).toEqual(["lock", "load"]);
        expect(mocks.emitPostRunUserEvent).toHaveBeenCalledWith(
            tx,
            "run-1",
            "artifact_reviewed",
            expect.objectContaining({ artifactId: "artifact-1", status: "applied" }),
            { artifactId: "artifact-1" },
        );
        expect(mocks.emitEvent).not.toHaveBeenCalled();
        expect(mocks.createCheckpoint).toHaveBeenCalledWith(tx, expect.objectContaining({
            runId: "run-1",
            eventSequence: 8,
        }));
        expect(result.artifact.appliedByUserId).toBe("reviewer-1");
    });
});
