import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    transaction: vi.fn(),
    studyUpdate: vi.fn(),
    studyUpdateMany: vi.fn(),
    protocolUpsert: vi.fn(),
    protocolFindUnique: vi.fn(),
    ensureProtocol: vi.fn(),
    syncProtocolToMemory: vi.fn(),
    executeRaw: vi.fn(),
    queryRaw: vi.fn(),
    userMemoryUpdateMany: vi.fn(),
    projectMemoryUpdate: vi.fn(),
    projectMemoryUpdateMany: vi.fn(),
    emitEvent: vi.fn(),
    emitEventWithinTransaction: vi.fn(),
    createArtifactCheckpointInTransaction: vi.fn(),
    markRunDurabilityDegraded: vi.fn(),
    noteObservedRunActivity: vi.fn(),
    getDraft: vi.fn(),
    saveDraft: vi.fn(),
    draftFindUnique: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $transaction: mocks.transaction,
        artifact: {
            findUnique: mocks.findUnique,
            update: mocks.update,
            create: mocks.create,
        },
        study: {
            findFirst: mocks.findFirst,
            update: mocks.studyUpdate.mockImplementation(async (args: { data: unknown }) => args.data),
            updateMany: mocks.studyUpdateMany,
        },
        protocol: {
            findUnique: mocks.protocolFindUnique,
        },
    },
}));

vi.mock("@prisma/client", () => ({
    Prisma: {
        DbNull: "DbNull",
        sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
        join: (values: unknown[]) => values,
    },
}));

vi.mock("@/lib/server/agent/events", () => ({
    emitEvent: mocks.emitEvent,
    emitEventWithinTransaction: mocks.emitEventWithinTransaction,
    emitPostRunUserEventWithinTransaction: mocks.emitEventWithinTransaction,
}));

vi.mock("@/lib/server/agent/run-checkpoints", () => ({
    createArtifactCheckpointInTransaction: mocks.createArtifactCheckpointInTransaction,
}));

vi.mock("@/lib/server/agent/run", () => ({
    markRunDurabilityDegraded: mocks.markRunDurabilityDegraded,
    noteObservedRunActivity: mocks.noteObservedRunActivity,
}));

vi.mock("@/lib/server/memory/decision-extractor", () => ({
    onStudyAccepted: vi.fn(),
    onStudyExcluded: vi.fn(),
    onDraftAccepted: vi.fn(),
    onArtifactEdited: vi.fn(),
}));

vi.mock("@/lib/server/memory/protocol-sync", () => ({
    syncProtocolToMemory: mocks.syncProtocolToMemory,
}));

vi.mock("@/lib/server/protocols", () => ({
    ensureProtocolWithDb: mocks.ensureProtocol,
    saveProtocolTrusted: mocks.protocolUpsert,
}));

vi.mock("@/lib/protocol-fields", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/protocol-fields")>();
    return {
        ...original,
        validateFieldValue: vi.fn().mockReturnValue({ valid: true, value: "new value" }),
        isValidFieldPath: vi.fn().mockReturnValue(true),
    };
});

vi.mock("@/lib/server/memory", () => ({
    setUserMemoryWithDb: vi.fn(),
    createProjectMemoryWithDb: vi.fn().mockResolvedValue({ id: "pm-1" }),
    getProjectMemories: vi.fn().mockResolvedValue([]),
    getUserMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/server/memory/conflict-policy", () => ({
    normalizedMemoryKey: vi.fn((key: string) => key),
    normalizedMemoryValue: vi.fn((val: string) => val),
}));

vi.mock("@/lib/server/notes", () => ({
    createNoteTrusted: vi.fn(),
    updateNoteTrusted: vi.fn(),
    textToTipTapDoc: vi.fn((text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })),
    listNotesTrusted: vi.fn().mockResolvedValue([]),
    extractTextFromContent: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/server/ledger", () => ({
    upsertStudyTrusted: vi.fn(),
    updateStudyTrusted: vi.fn(),
}));

vi.mock("@/lib/server/drafts", () => ({
    getDraftTrusted: mocks.getDraft,
    saveDraftTrusted: mocks.saveDraft,
}));

vi.mock("@/lib/draft-storage", () => ({
    createDefaultDraftState: vi.fn().mockReturnValue({
        contentBySection: {},
    }),
}));

vi.mock("@/types/draft", () => ({
    DRAFT_SECTIONS: [
        { key: "introduction", label: "Introduction" },
        { key: "methods", label: "Methods" },
        { key: "results", label: "Results" },
        { key: "discussion", label: "Discussion" },
    ],
}));

vi.mock("@/types/artifacts", async (importOriginal) => {
    const original = await importOriginal() as Record<string, unknown>;
    return {
        ...original,
        ARTIFACT_PAYLOAD_SCHEMAS: {},
    };
});

vi.mock("@/lib/server/draft-versions", () => ({
    createDraftVersionTrusted: vi.fn(),
}));

const { undoArtifact, applyArtifact } = await import("@/lib/server/agent/artifacts");
const { upsertStudyTrusted, updateStudyTrusted } = await import("@/lib/server/ledger");
const mockUpsertStudy = vi.mocked(upsertStudyTrusted);
const mockUpdateStudy = vi.mocked(updateStudyTrusted);
const originalArtifactUndoWindowMs = process.env.ARTIFACT_UNDO_WINDOW_MS;

// ── Helpers ────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Record<string, unknown> = {}) {
    return {
        id: "art-1",
        runId: "run-1",
        projectId: "proj-1",
        conversationId: null,
        userId: "u1",
        type: "protocol_suggestion",
        status: overrides.appliedAt ? "accepted" : "proposed",
        title: "Protocol: researchQuestion",
        payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        snapshot: null,
        version: 1,
        sourceEventId: null,
        applyId: null,
        appliedAt: null,
        appliedByUserId: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: new Date(),
        project: {
            ownerId: "u1",
            workspaceId: "w1",
        },
        ...overrides,
    };
}

function makeTx() {
    return {
        artifact: {
            findUnique: mocks.findUnique,
            update: mocks.update,
            create: mocks.create,
        },
        study: {
            findFirst: mocks.findFirst,
            update: mocks.studyUpdate,
            updateMany: mocks.studyUpdateMany,
        },
        protocol: {
            findUnique: mocks.protocolFindUnique,
        },
        draft: {
            findUnique: mocks.draftFindUnique,
        },
        userMemory: {
            updateMany: mocks.userMemoryUpdateMany,
        },
        projectMemory: {
            update: mocks.projectMemoryUpdate,
            updateMany: mocks.projectMemoryUpdateMany,
        },
        $executeRaw: mocks.executeRaw,
        $queryRaw: mocks.queryRaw,
    };
}

function undoEnvelope(before: unknown, applied: unknown) {
    return {
        undoSnapshotVersion: 1,
        before,
        applied,
    };
}

function protocolFieldState(value: unknown) {
    return {
        version: "2026-07-12T10:00:00.000Z",
        field: "researchQuestion",
        value: { exists: true, value },
    };
}

function criteriaState(
    inclusion: string[],
    exclusion: string[],
    version = "2026-07-12T10:00:00.000Z",
) {
    return {
        version,
        eligibility: { inclusion, exclusion },
    };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("undoArtifact", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.update.mockResolvedValue({ id: "art-1", runId: "run-1", status: "rejected" });
        mocks.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
            id: "art-created",
            ...args.data,
        }));
        mocks.emitEventWithinTransaction.mockResolvedValue({
            sequence: 1,
            createdAt: new Date("2026-03-14T12:00:00.000Z"),
        });
        mocks.createArtifactCheckpointInTransaction.mockResolvedValue(undefined);
        mocks.markRunDurabilityDegraded.mockResolvedValue(1);
        mocks.noteObservedRunActivity.mockReturnValue(undefined);
        mocks.protocolUpsert.mockResolvedValue(undefined);
        mocks.ensureProtocol.mockResolvedValue({
            researchQuestion: "Current RQ",
            pico: { population: "adults", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: ["Current inclusion"], exclusion: ["Current exclusion"] },
        });
        mocks.syncProtocolToMemory.mockResolvedValue(undefined);
        mocks.executeRaw.mockResolvedValue(1);
        mocks.queryRaw.mockResolvedValue([{ locked: 1 }]);
        mocks.userMemoryUpdateMany.mockResolvedValue({ count: 0 });
        mocks.projectMemoryUpdate.mockResolvedValue(undefined);
        mocks.projectMemoryUpdateMany.mockResolvedValue({ count: 0 });
        mocks.studyUpdateMany.mockResolvedValue({ count: 1 });
        mocks.draftFindUnique.mockResolvedValue(null);
        mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(makeTx()));
    });

    afterEach(() => {
        if (originalArtifactUndoWindowMs === undefined) {
            delete process.env.ARTIFACT_UNDO_WINDOW_MS;
            return;
        }

        process.env.ARTIFACT_UNDO_WINDOW_MS = originalArtifactUndoWindowMs;
    });

    it("throws when artifact not found", async () => {
        mocks.findUnique.mockResolvedValue(null);
        await expect(undoArtifact("art-missing")).rejects.toThrow("Artifact not found");
    });

    it("throws when artifact has not been applied", async () => {
        mocks.findUnique.mockResolvedValue(makeArtifact({ appliedAt: null }));
        await expect(undoArtifact("art-1")).rejects.toThrow("has not been applied");
    });

    it("throws when undo window has expired", async () => {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        mocks.findUnique.mockResolvedValue(makeArtifact({ appliedAt: tenMinutesAgo, snapshot: {} }));
        await expect(undoArtifact("art-1")).rejects.toThrow("Undo window has expired");
    });

    it("honors a configured undo window", async () => {
        process.env.ARTIFACT_UNDO_WINDOW_MS = String(15 * 60 * 1000);
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "protocol_suggestion",
            appliedAt: tenMinutesAgo,
            snapshot: undoEnvelope(protocolFieldState("Old RQ"), protocolFieldState("New RQ")),
            payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        }));
        mocks.ensureProtocol.mockResolvedValue({
            researchQuestion: "New RQ",
            pico: { population: "adults", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: [], exclusion: [] },
        });

        await undoArtifact("art-1");

        expect(mocks.protocolUpsert).toHaveBeenCalledWith(
            expect.any(Object),
            "proj-1",
            expect.objectContaining({ researchQuestion: "Old RQ" }),
        );
    });

    it("restores protocol_suggestion field to previous value on undo", async () => {
        const recentApply = new Date(Date.now() - 60_000); // 1 minute ago
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "protocol_suggestion",
            appliedAt: recentApply,
            snapshot: undoEnvelope(protocolFieldState("Old RQ"), protocolFieldState("New RQ")),
            payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        }));
        mocks.ensureProtocol.mockResolvedValue({
            researchQuestion: "New RQ",
            pico: { population: "adults", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: [], exclusion: [] },
        });

        await undoArtifact("art-1");

        // Should call prisma.protocol.update to restore
        expect(mocks.protocolUpsert).toHaveBeenCalledWith(
            expect.any(Object),
            "proj-1",
            expect.objectContaining({ researchQuestion: "Old RQ" }),
        );
        // Should mark artifact as rejected
        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: "art-1" },
            data: { status: "rejected", reviewNote: "Undone by user" },
        });
        expect(mocks.syncProtocolToMemory).toHaveBeenCalledWith(
            "proj-1",
            expect.objectContaining({ researchQuestion: "Old RQ" }),
        );
    });

    it("fails closed when the applied protocol field was edited concurrently", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "protocol_suggestion",
            appliedAt: recentApply,
            snapshot: undoEnvelope(protocolFieldState("Old RQ"), protocolFieldState("New RQ")),
            payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        }));
        mocks.ensureProtocol.mockResolvedValue({
            researchQuestion: "Concurrent RQ",
            pico: { population: "", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: [], exclusion: [] },
        });

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_UNDO_CONFLICT",
        });

        expect(mocks.protocolUpsert).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.ensureProtocol.mock.results[0]?.value).toBeDefined();
    });

    it("apply -> concurrent protocol edit -> undo preserves the edit and artifact status", async () => {
        let artifactState = makeArtifact({
            type: "protocol_suggestion",
            status: "proposed",
            payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        });
        const protocolState = {
            researchQuestion: "Old RQ",
            pico: { population: "", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: [], exclusion: [] },
        };
        let protocolUpdatedAt = new Date("2026-07-12T09:00:00.000Z");
        mocks.findUnique.mockImplementation(async () => artifactState);
        mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            artifactState = { ...artifactState, ...data };
            return artifactState;
        });
        mocks.protocolFindUnique.mockImplementation(async () => ({
            data: structuredClone(protocolState),
            updatedAt: protocolUpdatedAt,
        }));
        mocks.ensureProtocol.mockImplementation(async () => protocolState);
        mocks.protocolUpsert.mockImplementation(async () => {
            protocolUpdatedAt = new Date("2026-07-12T10:00:00.000Z");
        });

        await applyArtifact("art-1", "accepted");
        expect(artifactState.status).toBe("accepted");
        expect(protocolState.researchQuestion).toBe("new value");

        protocolState.researchQuestion = "Concurrent RQ";
        protocolUpdatedAt = new Date("2026-07-12T11:00:00.000Z");

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_UNDO_CONFLICT",
        });
        expect(protocolState.researchQuestion).toBe("Concurrent RQ");
        expect(artifactState.status).toBe("accepted");
        expect(mocks.update).toHaveBeenCalledTimes(1);
    });

    it("restores criteria_card eligibility on undo", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "criteria_card",
            appliedAt: recentApply,
            snapshot: undoEnvelope(
                criteriaState(["Old inclusion"], ["Old exclusion"]),
                criteriaState(["New inclusion"], ["New exclusion"]),
            ),
            payload: { inclusion: ["New inclusion"], exclusion: ["New exclusion"] },
        }));
        mocks.ensureProtocol.mockResolvedValue({
            researchQuestion: "RQ",
            pico: { population: "", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: ["New inclusion"], exclusion: ["New exclusion"] },
        });

        await undoArtifact("art-1");

        expect(mocks.protocolUpsert).toHaveBeenCalledWith(
            expect.any(Object),
            "proj-1",
            expect.objectContaining({
                eligibility: { inclusion: ["Old inclusion"], exclusion: ["Old exclusion"] },
            }),
        );
        expect(mocks.syncProtocolToMemory).toHaveBeenCalledWith(
            "proj-1",
            expect.objectContaining({
                eligibility: { inclusion: ["Old inclusion"], exclusion: ["Old exclusion"] },
            }),
        );
    });

    it("undoes only a criteria delta and preserves concurrent criteria", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "criteria_card",
            appliedAt: recentApply,
            snapshot: undoEnvelope(
                criteriaState(["Adults"], ["Case reports"]),
                criteriaState(["Adults", "RCT"], ["Case reports"]),
            ),
            payload: {
                inclusion: ["Adults", "RCT"],
                exclusion: ["Case reports"],
                mutation: { action: "add", type: "inclusion", criterion: "RCT" },
            },
        }));
        mocks.ensureProtocol.mockResolvedValue({
            researchQuestion: "RQ",
            pico: { population: "", intervention: "", comparison: "", outcome: "" },
            eligibility: {
                inclusion: ["Adults", "Concurrent criterion", "RCT"],
                exclusion: ["Case reports", "Concurrent exclusion"],
            },
        });

        await undoArtifact("art-1");

        expect(mocks.protocolUpsert).toHaveBeenCalledWith(
            expect.any(Object),
            "proj-1",
            expect.objectContaining({
                eligibility: {
                    inclusion: ["Adults", "Concurrent criterion"],
                    exclusion: ["Case reports", "Concurrent exclusion"],
                },
            }),
        );
    });

    it("fails criteria undo when the artifact-owned delta changed concurrently", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "criteria_card",
            appliedAt: recentApply,
            snapshot: undoEnvelope(
                criteriaState(["Adults"], []),
                criteriaState(["Adults", "RCT"], []),
            ),
            payload: {
                inclusion: ["Adults", "RCT"],
                exclusion: [],
                mutation: { action: "add", type: "inclusion", criterion: "RCT" },
            },
        }));
        mocks.ensureProtocol.mockResolvedValue({
            researchQuestion: "RQ",
            pico: { population: "", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: ["Adults"], exclusion: [] },
        });

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_UNDO_CONFLICT",
        });

        expect(mocks.protocolUpsert).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("fails criteria undo when the artifact-owned criterion text changed concurrently", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "criteria_card",
            appliedAt: recentApply,
            snapshot: undoEnvelope(
                criteriaState(["Adults"], []),
                criteriaState(["Adults", "RCT"], []),
            ),
            payload: {
                inclusion: ["Adults", "RCT"],
                exclusion: [],
                mutation: { action: "add", type: "inclusion", criterion: "RCT" },
            },
        }));
        mocks.ensureProtocol.mockResolvedValue({
            researchQuestion: "RQ",
            pico: { population: "", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: ["Adults", "rct"], exclusion: [] },
        });

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_UNDO_CONFLICT",
        });

        expect(mocks.protocolUpsert).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("restores study_update fields on undo", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        const beforeStudyState = {
            id: "study-1",
            version: "2026-07-12T09:00:00.000Z",
            top: { quality: { exists: true, value: "-" } },
            details: {},
            detailsContainerWasNull: false,
        };
        const appliedStudyState = {
            ...beforeStudyState,
            version: "2026-07-12T10:00:00.000Z",
            top: { quality: { exists: true, value: "High" } },
        };
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "study_update",
            appliedAt: recentApply,
            snapshot: undoEnvelope(beforeStudyState, appliedStudyState),
            payload: { studyId: "study-1", studyTitle: "Original Title", snapshotAt: new Date().toISOString(), idempotencyKey: "k1", patch: { top: { quality: "High" } }, changes: [], rationale: "test" },
        }));
        mocks.findFirst.mockResolvedValue({
            id: "study-1",
            title: "Original Title",
            authors: "Author A",
            year: 2024,
            status: "pending",
            quality: "High",
            details: { doi: "10.1234/test" },
            updatedAt: new Date("2026-07-12T10:00:00.000Z"),
        });

        const { prisma } = await import("@/lib/server/prisma");

        await undoArtifact("art-1");

        expect(prisma.study.update).toHaveBeenCalledWith({
            where: { id: "study-1" },
            data: { quality: "-" },
        });
    });

    it("fails study_update undo when an applied field changed concurrently", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        const before = {
            id: "study-1",
            version: "2026-07-12T09:00:00.000Z",
            top: { quality: { exists: true, value: "-" } },
            details: {},
            detailsContainerWasNull: false,
        };
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "study_update",
            appliedAt: recentApply,
            snapshot: undoEnvelope(before, {
                ...before,
                version: "2026-07-12T10:00:00.000Z",
                top: { quality: { exists: true, value: "High" } },
            }),
            payload: { studyId: "study-1", patch: { top: { quality: "High" } } },
        }));
        mocks.findFirst.mockResolvedValue({
            id: "study-1",
            title: "Study",
            authors: "A",
            year: 2024,
            status: "active",
            quality: "Medium",
            details: {},
            updatedAt: new Date("2026-07-12T11:00:00.000Z"),
        });

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_UNDO_CONFLICT",
        });

        expect(mocks.studyUpdate).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("fails study_deletion undo when deletion state changed concurrently", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        const deletedAt = "2026-07-12T10:00:00.000Z";
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "study_deletion",
            appliedAt: recentApply,
            snapshot: undoEnvelope(
                { id: "study-1", version: "2026-07-12T09:00:00.000Z", deletedAt: null },
                { id: "study-1", version: deletedAt, deletedAt },
            ),
            payload: { studyId: "study-1", title: "Study" },
        }));
        mocks.findFirst.mockResolvedValue({
            id: "study-1",
            deletedAt: null,
            updatedAt: new Date("2026-07-12T11:00:00.000Z"),
        });

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_UNDO_CONFLICT",
        });

        expect(mocks.studyUpdateMany).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("soft-deletes newly-created study on study_proposal undo when snapshot is null", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "study_proposal",
            appliedAt: recentApply,
            snapshot: undoEnvelope(null, {
                id: "study-new",
                version: "2026-07-12T10:00:00.000Z",
                title: "New Study",
                authors: "A",
                year: 2025,
                status: "active",
                quality: "-",
                details: { triageDecision: "keep", source: "pubmed" },
                deletedAt: null,
            }),
            payload: { title: "New Study", authors: "A", year: 2025, source: "pubmed", recommendation: "keep", confidence: 0.9 },
        }));
        mocks.findFirst.mockResolvedValue({
            id: "study-new",
            title: "New Study",
            authors: "A",
            year: 2025,
            status: "active",
            quality: "-",
            details: { triageDecision: "keep", source: "pubmed" },
            deletedAt: null,
            updatedAt: new Date("2026-07-12T10:00:00.000Z"),
        });

        await undoArtifact("art-1");

        expect(mocks.studyUpdate).toHaveBeenCalledWith({
            where: { id: "study-new" },
            data: { deletedAt: expect.any(Date) },
        });
    });

    it("restores draft_diff section content on undo", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        const previousContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Old text" }] }] };
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "draft_diff",
            appliedAt: recentApply,
            snapshot: undoEnvelope(
                {
                    version: "2026-07-12T09:00:00.000Z",
                    sectionKey: "introduction",
                    content: { exists: true, value: previousContent },
                },
                {
                    version: "2026-07-12T10:00:00.000Z",
                    sectionKey: "introduction",
                    content: { exists: true, value: { type: "doc", content: [] } },
                },
            ),
            payload: { section: "Introduction", content: "New text", citations: [], wordCount: 2 },
        }));
        mocks.getDraft.mockResolvedValue({
            contentBySection: { introduction: { type: "doc", content: [] } },
        });

        await undoArtifact("art-1");

        expect(mocks.saveDraft).toHaveBeenCalledWith(
            expect.any(Object),
            "proj-1",
            expect.objectContaining({
                contentBySection: expect.objectContaining({
                    introduction: previousContent,
                }),
            }),
        );
    });

    it("fails draft undo when the applied section changed concurrently", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        const appliedContent = { type: "doc", content: [{ type: "text", text: "Applied" }] };
        const concurrentContent = { type: "doc", content: [{ type: "text", text: "Concurrent" }] };
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "draft_diff",
            appliedAt: recentApply,
            snapshot: undoEnvelope(
                { version: null, sectionKey: "introduction", content: { exists: false, value: null } },
                { version: "2026-07-12T10:00:00.000Z", sectionKey: "introduction", content: { exists: true, value: appliedContent } },
            ),
            payload: { section: "Introduction", content: "Applied", citations: [], wordCount: 1 },
        }));
        mocks.getDraft.mockResolvedValue({
            contentBySection: { introduction: concurrentContent },
        });

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_UNDO_CONFLICT",
        });

        expect(mocks.saveDraft).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("rejects unsupported undo without restoring or relabeling the artifact", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "memory_proposal",
            appliedAt: recentApply,
            snapshot: { some: "data" },
        }));

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_UNDO_UNSUPPORTED",
        });

        // No restore should happen — no study/protocol/draft writes
        expect(mocks.protocolUpsert).not.toHaveBeenCalled();
        expect(mocks.findFirst).not.toHaveBeenCalled();
        expect(mocks.saveDraft).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.syncProtocolToMemory).not.toHaveBeenCalled();
    });

    it.each([
        "protocol_suggestion",
        "criteria_card",
        "study_update",
    ] as const)("fails closed when %s lacks its required snapshot", async (type) => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type,
            appliedAt: recentApply,
            snapshot: null,
        }));

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_UNDO_CONFLICT",
        });

        expect(mocks.protocolUpsert).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.syncProtocolToMemory).not.toHaveBeenCalled();
    });

    it("runs restored protocol memory synchronization only after the restore transaction commits", async () => {
        const order: string[] = [];
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "protocol_suggestion",
            appliedAt: recentApply,
            snapshot: undoEnvelope(protocolFieldState("Old RQ"), protocolFieldState("New RQ")),
        }));
        mocks.ensureProtocol.mockResolvedValue({
            researchQuestion: "New RQ",
            pico: { population: "", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: [], exclusion: [] },
        });
        mocks.protocolUpsert.mockImplementation(async () => {
            order.push("restore");
        });
        mocks.update.mockImplementation(async () => {
            order.push("artifact-status");
            return { id: "art-1", runId: "run-1", status: "rejected" };
        });
        mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const result = await callback(makeTx());
            order.push("commit");
            return result;
        });
        mocks.syncProtocolToMemory.mockImplementation(async () => {
            order.push("memory-sync");
        });

        await undoArtifact("art-1");

        expect(order).toEqual(["restore", "artifact-status", "commit", "memory-sync"]);
    });

    it("refuses a repeated undo before any stale snapshot restoration", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "protocol_suggestion",
            status: "rejected",
            appliedAt: recentApply,
            snapshot: { field: "researchQuestion", previousValue: "Old RQ" },
        }));

        await expect(undoArtifact("art-1")).rejects.toMatchObject({
            errorCode: "ARTIFACT_INVALID_STATE",
        });

        expect(mocks.protocolUpsert).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
});

describe("applyArtifact — snapshot capture", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.update.mockResolvedValue({ id: "art-1", status: "accepted", appliedAt: new Date() });
        mocks.emitEvent.mockResolvedValue({ id: "evt-1" });
        mocks.protocolUpsert.mockResolvedValue(undefined);
        mocks.executeRaw.mockResolvedValue(1);
        mocks.userMemoryUpdateMany.mockResolvedValue({ count: 0 });
        mocks.projectMemoryUpdate.mockResolvedValue(undefined);
        mocks.projectMemoryUpdateMany.mockResolvedValue({ count: 0 });
        mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(makeTx()));
        mockUpsertStudy.mockResolvedValue({
            id: "study-upserted",
            title: "x",
            authors: "y",
            year: 2024,
            status: "pending",
            quality: "-",
        } as never);
        mockUpdateStudy.mockResolvedValue({
            id: "study-updated",
            title: "x",
            authors: "y",
            year: 2024,
            status: "excluded",
            quality: "-",
        } as never);
    });

    it("captures protocol_suggestion snapshot before applying", async () => {
        const artifact = makeArtifact({
            type: "protocol_suggestion",
            status: "proposed",
            payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.protocolFindUnique
            .mockResolvedValueOnce({
                data: { researchQuestion: "Old RQ", pico: {}, eligibility: { inclusion: [], exclusion: [] } },
                updatedAt: new Date("2026-07-12T09:00:00.000Z"),
            })
            .mockResolvedValueOnce({
                data: { researchQuestion: "new value", pico: {}, eligibility: { inclusion: [], exclusion: [] } },
                updatedAt: new Date("2026-07-12T10:00:00.000Z"),
            });

        await applyArtifact("art-1");

        // First update should be the snapshot capture
        const snapshotCall = mocks.update.mock.calls.find(
            (call: unknown[]) => {
                const arg = call[0] as { data?: { snapshot?: unknown } };
                return arg?.data?.snapshot !== undefined;
            }
        );
        expect(snapshotCall).toBeDefined();
        const snapshotData = (snapshotCall![0] as { data: { snapshot: unknown } }).data.snapshot;
        expect(snapshotData).toEqual(undoEnvelope(
            {
                version: "2026-07-12T09:00:00.000Z",
                field: "researchQuestion",
                value: { exists: true, value: "Old RQ" },
            },
            {
                version: "2026-07-12T10:00:00.000Z",
                field: "researchQuestion",
                value: { exists: true, value: "new value" },
            },
        ));
    });

    it("captures criteria_card eligibility snapshot before applying", async () => {
        const artifact = makeArtifact({
            type: "criteria_card",
            status: "proposed",
            payload: { inclusion: ["New"], exclusion: ["New excl"] },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.protocolFindUnique
            .mockResolvedValueOnce({
                data: {
                    researchQuestion: "RQ",
                    pico: {},
                    eligibility: { inclusion: ["Original"], exclusion: ["Original excl"] },
                },
                updatedAt: new Date("2026-07-12T09:00:00.000Z"),
            })
            .mockResolvedValueOnce({
                data: {
                    researchQuestion: "RQ",
                    pico: {},
                    eligibility: { inclusion: ["New"], exclusion: ["New excl"] },
                },
                updatedAt: new Date("2026-07-12T10:00:00.000Z"),
            });

        await applyArtifact("art-1");

        const snapshotCall = mocks.update.mock.calls.find(
            (call: unknown[]) => {
                const arg = call[0] as { data?: { snapshot?: unknown } };
                return arg?.data?.snapshot !== undefined;
            }
        );
        expect(snapshotCall).toBeDefined();
        const snapshotData = (snapshotCall![0] as { data: { snapshot: unknown } }).data.snapshot;
        expect(snapshotData).toEqual(undoEnvelope(
            criteriaState(["Original"], ["Original excl"], "2026-07-12T09:00:00.000Z"),
            criteriaState(["New"], ["New excl"]),
        ));
    });

    it("captures study_update snapshot before applying", async () => {
        const studyRow = {
            id: "study-1", title: "Title", authors: "A", year: 2024,
            status: "pending", quality: "-", details: { doi: "10.1234/x" },
            updatedAt: new Date("2026-07-12T09:00:00.000Z"),
        };
        const artifact = makeArtifact({
            type: "study_update",
            status: "proposed",
            payload: {
                studyId: "study-1", studyTitle: "Title",
                snapshotAt: new Date().toISOString(), idempotencyKey: "k1",
                patch: { top: { quality: "High" } }, changes: [], rationale: "upgrade",
            },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.findFirst
            .mockResolvedValueOnce(studyRow)
            .mockResolvedValueOnce({ updatedAt: studyRow.updatedAt })
            .mockResolvedValueOnce({
                ...studyRow,
                quality: "High",
                updatedAt: new Date("2026-07-12T10:00:00.000Z"),
            });

        await applyArtifact("art-1");

        const snapshotCall = mocks.update.mock.calls.find(
            (call: unknown[]) => {
                const arg = call[0] as { data?: { snapshot?: unknown } };
                return arg?.data?.snapshot !== undefined;
            }
        );
        expect(snapshotCall).toBeDefined();
        const snapshotData = (snapshotCall![0] as { data: { snapshot: unknown } }).data.snapshot;
        expect(snapshotData).toEqual(undoEnvelope(
            {
                id: "study-1",
                version: "2026-07-12T09:00:00.000Z",
                top: { quality: { exists: true, value: "-" } },
                details: {},
                detailsContainerWasNull: false,
            },
            {
                id: "study-1",
                version: "2026-07-12T10:00:00.000Z",
                top: { quality: { exists: true, value: "High" } },
                details: {},
                detailsContainerWasNull: false,
            },
        ));
    });

    it("writes DbNull snapshot when entity does not exist (study_proposal)", async () => {
        const artifact = makeArtifact({
            type: "study_proposal",
            status: "proposed",
            payload: { title: "Brand New", authors: "B", year: 2025, source: "pubmed", recommendation: "keep", confidence: 0.9 },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.findFirst.mockResolvedValueOnce({
                id: "study-upserted",
                title: "Brand New",
                authors: "B",
                year: 2025,
                status: "active",
                quality: "-",
                details: { triageDecision: "keep", source: "pubmed" },
                deletedAt: null,
                updatedAt: new Date("2026-07-12T10:00:00.000Z"),
            });

        await applyArtifact("art-1");

        const snapshotCall = mocks.update.mock.calls.find(
            (call: unknown[]) => {
                const arg = call[0] as { data?: { snapshot?: unknown } };
                return arg?.data?.snapshot !== undefined;
            }
        );
        expect(snapshotCall).toBeDefined();
        expect((snapshotCall![0] as { data: { snapshot: unknown } }).data.snapshot).toEqual(
            undoEnvelope(null, {
                id: "study-upserted",
                version: "2026-07-12T10:00:00.000Z",
                title: "Brand New",
                authors: "B",
                year: 2025,
                status: "active",
                quality: "-",
                details: { triageDecision: "keep", source: "pubmed" },
                deletedAt: null,
            }),
        );
    });

    it("applies study_proposal by updating existing study when payload studyId is present", async () => {
        const artifact = makeArtifact({
            type: "study_proposal",
            status: "proposed",
            payload: {
                studyId: "study-existing",
                title: "Existing",
                authors: "A",
                year: 2024,
                source: "bulk-screening",
                recommendation: "exclude",
                confidence: 0.9,
                matchRationale: "Mismatch",
            },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.findFirst.mockResolvedValue({
            id: "study-existing",
            title: "Existing",
            authors: "A",
            year: 2024,
            status: "pending",
            quality: "-",
            details: {},
        });

        await applyArtifact("art-1");

        expect(mockUpdateStudy).toHaveBeenCalledWith(
            expect.any(Object),
            "proj-1",
            "w1",
            "study-existing",
            expect.objectContaining({
                status: "excluded",
                details: expect.objectContaining({
                    triageDecision: "exclude",
                    source: "copilot",
                }),
            })
        );
        expect(mockUpsertStudy).not.toHaveBeenCalled();
    });
});

describe("applyArtifact — screening_batch identity + status mapping", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.update.mockResolvedValue({ id: "art-1", status: "accepted", appliedAt: new Date() });
        mocks.emitEvent.mockResolvedValue({ id: "evt-1" });
        mocks.protocolUpsert.mockResolvedValue(undefined);
        mocks.executeRaw.mockResolvedValue(1);
        mocks.userMemoryUpdateMany.mockResolvedValue({ count: 0 });
        mocks.projectMemoryUpdate.mockResolvedValue(undefined);
        mocks.projectMemoryUpdateMany.mockResolvedValue({ count: 0 });
        mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(makeTx()));
    });

    it("applies by studyId and persists screening metadata", async () => {
        const artifact = makeArtifact({
            type: "screening_batch",
            status: "proposed",
            payload: {
                studies: [
                    {
                        studyId: "study-1",
                        title: "Title A",
                        authors: "A",
                        year: 2023,
                        source: "bulk-screening",
                        recommendation: "exclude",
                        confidence: 0.88,
                        screeningTier: "ai",
                        modelUsed: "grok-4-1-fast",
                        matchRationale: "Failed core criteria",
                    },
                ],
                summary: { total: 1, keepCount: 0, excludeCount: 1, maybeCount: 0 },
            },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.findFirst.mockResolvedValue({
            id: "study-1",
            details: { triageDecision: "maybe" },
        });

        await applyArtifact("art-1");

        expect(mocks.findFirst).toHaveBeenCalledWith({
            where: { id: "study-1", projectId: "proj-1", deletedAt: null },
            select: { id: true, details: true },
        });
        expect(mocks.studyUpdate).toHaveBeenCalledWith({
            where: { id: "study-1" },
            data: {
                status: "excluded",
                details: expect.objectContaining({
                    triageDecision: "exclude",
                    matchRationale: "Failed core criteria",
                    screeningMeta: expect.objectContaining({
                        tier: "ai",
                        modelConfidence: 0.88,
                        reasons: ["Failed core criteria"],
                        modelUsed: "grok-4-1-fast",
                    }),
                }),
            },
        });
    });

    it("maps maybe recommendation to pending status", async () => {
        const artifact = makeArtifact({
            type: "screening_batch",
            status: "proposed",
            payload: {
                studies: [
                    {
                        studyId: "study-2",
                        title: "Title B",
                        authors: "B",
                        year: 2024,
                        source: "bulk-screening",
                        recommendation: "maybe",
                        confidence: 0.2,
                        screeningTier: "default",
                        matchRationale: "Manual review needed",
                    },
                ],
                summary: { total: 1, keepCount: 0, excludeCount: 0, maybeCount: 1 },
            },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.findFirst.mockResolvedValue({
            id: "study-2",
            details: {},
        });

        await applyArtifact("art-1");

        expect(mocks.studyUpdate).toHaveBeenCalledWith({
            where: { id: "study-2" },
            data: {
                status: "pending",
                details: expect.objectContaining({
                    triageDecision: "maybe",
                }),
            },
        });
    });

    it("does not fallback to title when studyId is present but missing", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const artifact = makeArtifact({
            type: "screening_batch",
            status: "proposed",
            payload: {
                studies: [
                    {
                        studyId: "missing-study",
                        title: "Same Title",
                        authors: "A",
                        year: 2023,
                        source: "bulk-screening",
                        recommendation: "keep",
                        confidence: 0.9,
                        screeningTier: "ai",
                    },
                ],
                summary: { total: 1, keepCount: 1, excludeCount: 0, maybeCount: 0 },
            },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.findFirst.mockResolvedValue(null);

        await applyArtifact("art-1");

        expect(mocks.findFirst).toHaveBeenCalledTimes(1);
        expect(mocks.studyUpdate).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("falls back to title only for legacy payloads without studyId", async () => {
        const artifact = makeArtifact({
            type: "screening_batch",
            status: "proposed",
            payload: {
                studies: [
                    {
                        title: "Legacy Title",
                        authors: "Legacy",
                        year: 2020,
                        source: "bulk-screening",
                        recommendation: "keep",
                        confidence: 0.9,
                    },
                ],
                summary: { total: 1, keepCount: 1, excludeCount: 0, maybeCount: 0 },
            },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.findFirst.mockResolvedValue({
            id: "legacy-study",
            details: {},
        });

        await applyArtifact("art-1");

        expect(mocks.findFirst).toHaveBeenCalledWith({
            where: { projectId: "proj-1", title: "Legacy Title", deletedAt: null },
            select: { id: true, details: true },
        });
        expect(mocks.studyUpdate).toHaveBeenCalledWith({
            where: { id: "legacy-study" },
            data: {
                status: "active",
                details: expect.objectContaining({
                    triageDecision: "keep",
                }),
            },
        });
    });
});
