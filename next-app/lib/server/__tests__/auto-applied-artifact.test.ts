import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredArtifact = {
    id: string;
    runId: string;
    projectId: string | null;
    conversationId: string | null;
    userId: string | null;
    type: string;
    status: string;
    title: string;
    payload: unknown;
    sourceEventId: string | null;
    applyId: string;
    appliedAt: Date;
    version: number;
};

type Store = {
    artifacts: StoredArtifact[];
    events: Array<Record<string, unknown>>;
    checkpoints: Array<Record<string, unknown>>;
};

const mocks = vi.hoisted(() => ({
    artifactFindUnique: vi.fn(),
    transaction: vi.fn(),
    emitEventWithinTransaction: vi.fn(),
    createArtifactCheckpointInTransaction: vi.fn(),
    noteObservedRunActivity: vi.fn(),
    validateArtifactPayload: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        artifact: {
            findUnique: mocks.artifactFindUnique,
            create: vi.fn(),
        },
        $transaction: mocks.transaction,
    },
}));

vi.mock("@/lib/server/agent/events", () => ({
    emitEventWithinTransaction: mocks.emitEventWithinTransaction,
}));

vi.mock("@/lib/server/agent/run-checkpoints", () => ({
    createArtifactCheckpointInTransaction:
        mocks.createArtifactCheckpointInTransaction,
}));

vi.mock("@/lib/server/agent/run", () => ({
    noteObservedRunActivity: mocks.noteObservedRunActivity,
}));

vi.mock("@/lib/server/agent/artifact-execution", () => ({
    artifactExecutionSelect: {},
    ArtifactDurabilityPersistenceError: class extends Error {},
    buildExecutionContext: vi.fn(),
    executePostCommitTasks: vi.fn(),
    loadArtifactForExecution: vi.fn(),
    lockArtifactExecutionInTransaction: vi.fn(),
    markDurabilityAndRethrow: vi.fn(),
    runArtifactApplyTransaction: vi.fn(),
    validateArtifactPayload: mocks.validateArtifactPayload,
}));

vi.mock("@/lib/server/agent/artifact-handler-registrations", () => ({
    isArtifactUndoSupportedType: vi.fn(() => false),
    buildEvidenceTableMarkdown: vi.fn(),
    registerArtifactHandlers: vi.fn(),
}));

vi.mock("@/lib/server/agent/artifact-config", () => ({
    formatArtifactUndoWindow: vi.fn(),
    getArtifactUndoWindowMs: vi.fn(() => 60_000),
}));

vi.mock("@/lib/server/memory/decision-extractor", () => ({
    onStudyAccepted: vi.fn(),
    onStudyExcluded: vi.fn(),
    onDraftAccepted: vi.fn(),
    onArtifactEdited: vi.fn(),
}));

vi.mock("@/lib/server/memory/conflict-policy", () => ({
    normalizedMemoryKey: vi.fn((value: string) => value),
}));

vi.mock("@/lib/server/logging", () => ({
    logServerError: vi.fn(),
}));

const { createAutoAppliedArtifact } = await import(
    "@/lib/server/agent/artifacts"
);

function createInput(overrides: Record<string, unknown> = {}) {
    return {
        runId: "run-1",
        projectId: null,
        conversationId: "conv-1",
        userId: "user-1",
        type: "scoping_report" as const,
        title: "Scoping: Hypertension",
        payload: {
            topic: "Hypertension",
            searchesRun: [],
            landscape: {
                majorThemes: [],
                evidenceGaps: [],
                methodologicalPatterns: [],
                evidenceDensity: "moderate",
            },
            recommendedQuestions: [],
            nextStep: "Choose a question.",
        },
        applyId: "scoping-report:run-1",
        ...overrides,
    };
}

describe("createAutoAppliedArtifact", () => {
    let committed: Store;

    beforeEach(() => {
        vi.clearAllMocks();
        committed = { artifacts: [], events: [], checkpoints: [] };

        mocks.artifactFindUnique.mockImplementation(
            async ({ where }: { where: { applyId: string } }) =>
                committed.artifacts.find(
                    (artifact) => artifact.applyId === where.applyId,
                ) ?? null,
        );
        mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const draft = structuredClone(committed);
            const tx = {
                __store: draft,
                artifact: {
                    create: vi.fn(async ({ data }: { data: Omit<StoredArtifact, "id" | "version"> }) => {
                        const artifact: StoredArtifact = {
                            id: `artifact-${draft.artifacts.length + 1}`,
                            version: 1,
                            ...data,
                        };
                        draft.artifacts.push(artifact);
                        return structuredClone(artifact);
                    }),
                },
            };
            const result = await callback(tx);
            committed = draft;
            return result;
        });
        mocks.emitEventWithinTransaction.mockImplementation(
            async (
                tx: { __store: Store },
                runId: string,
                type: string,
                payload: unknown,
                extras: unknown,
            ) => {
                const event = {
                    sequence: tx.__store.events.length + 7,
                    createdAt: new Date("2026-07-12T08:00:00.000Z"),
                    runId,
                    type,
                    payload,
                    extras,
                };
                tx.__store.events.push(event);
                return event;
            },
        );
        mocks.createArtifactCheckpointInTransaction.mockImplementation(
            async (tx: { __store: Store }, params: Record<string, unknown>) => {
                tx.__store.checkpoints.push(structuredClone(params));
            },
        );
    });

    it("commits one final row, authoritative review event, and matching checkpoint", async () => {
        const artifact = await createAutoAppliedArtifact(createInput());

        expect(artifact).toMatchObject({
            id: "artifact-1",
            runId: "run-1",
            projectId: null,
            conversationId: "conv-1",
            userId: "user-1",
            type: "scoping_report",
            status: "auto_applied",
            applyId: "scoping-report:run-1",
            version: 1,
        });
        expect(artifact.appliedAt).toBeInstanceOf(Date);
        expect(committed.artifacts).toHaveLength(1);
        expect(committed.events).toEqual([
            expect.objectContaining({
                runId: "run-1",
                type: "artifact_reviewed",
                payload: {
                    artifactId: "artifact-1",
                    status: "applied",
                    type: "scoping_report",
                },
                extras: { artifactId: "artifact-1" },
            }),
        ]);
        expect(committed.checkpoints).toEqual([
            expect.objectContaining({
                runId: "run-1",
                conversationId: "conv-1",
                eventSequence: 7,
                artifact: expect.objectContaining({
                    id: "artifact-1",
                    status: "auto_applied",
                    applyId: "scoping-report:run-1",
                }),
            }),
        ]);
        expect(mocks.noteObservedRunActivity).toHaveBeenCalledWith(
            "run-1",
            new Date("2026-07-12T08:00:00.000Z"),
        );
    });

    it("rolls back the final row when the authoritative event cannot be written", async () => {
        mocks.emitEventWithinTransaction.mockRejectedValueOnce(new Error("event failed"));

        await expect(createAutoAppliedArtifact(createInput())).rejects.toThrow("event failed");

        expect(committed).toEqual({ artifacts: [], events: [], checkpoints: [] });
        expect(mocks.createArtifactCheckpointInTransaction).not.toHaveBeenCalled();
        expect(mocks.noteObservedRunActivity).not.toHaveBeenCalled();
    });

    it("rolls back the final row and event when checkpoint persistence fails", async () => {
        mocks.createArtifactCheckpointInTransaction.mockRejectedValueOnce(
            new Error("checkpoint failed"),
        );

        await expect(createAutoAppliedArtifact(createInput())).rejects.toThrow(
            "checkpoint failed",
        );

        expect(committed).toEqual({ artifacts: [], events: [], checkpoints: [] });
        expect(mocks.noteObservedRunActivity).not.toHaveBeenCalled();
    });

    it("replays the committed live state without duplicating its event or checkpoint", async () => {
        const first = await createAutoAppliedArtifact(createInput());
        const replay = await createAutoAppliedArtifact(createInput());

        expect(replay).toEqual(first);
        expect(committed.artifacts).toHaveLength(1);
        expect(committed.events).toHaveLength(1);
        expect(committed.checkpoints).toHaveLength(1);
        expect(mocks.transaction).toHaveBeenCalledTimes(1);
        expect(mocks.noteObservedRunActivity).toHaveBeenCalledTimes(1);
    });

    it("does not let a reused idempotency key cross ownership scope", async () => {
        await createAutoAppliedArtifact(createInput());

        await expect(
            createAutoAppliedArtifact(createInput({ userId: "user-2" })),
        ).rejects.toThrow("already owned by another operation");
        expect(mocks.transaction).toHaveBeenCalledTimes(1);
    });
});
