import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    studyUpdate: vi.fn(),
    protocolFindUnique: vi.fn(),
    protocolUpdate: vi.fn(),
    emitEvent: vi.fn(),
    getDraft: vi.fn(),
    saveDraft: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        artifact: {
            findUnique: mocks.findUnique,
            update: mocks.update,
            create: vi.fn(),
        },
        study: {
            findFirst: mocks.findFirst,
            update: mocks.studyUpdate.mockImplementation(async (args: { data: unknown }) => args.data),
        },
        protocol: {
            findUnique: mocks.protocolFindUnique,
            update: mocks.protocolUpdate,
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
}));

vi.mock("@/lib/server/memory/decision-extractor", () => ({
    onStudyAccepted: vi.fn(),
    onStudyExcluded: vi.fn(),
    onDraftAccepted: vi.fn(),
    onArtifactEdited: vi.fn(),
}));

vi.mock("@/lib/server/memory/protocol-sync", () => ({
    syncProtocolToMemory: vi.fn(),
}));

vi.mock("@/lib/server/protocols", () => ({
    ensureProtocol: vi.fn().mockResolvedValue({
        researchQuestion: "Old RQ",
        pico: { population: "adults", intervention: "", comparison: "", outcome: "" },
        eligibility: { inclusion: ["English"], exclusion: ["animals"] },
    }),
}));

vi.mock("@/lib/protocol-fields", () => ({
    validateFieldValue: vi.fn().mockReturnValue({ valid: true, value: "new value" }),
    isValidFieldPath: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/server/actor", () => ({
    requireActorContext: vi.fn().mockReturnValue({ userId: "u1", workspaceId: "w1" }),
}));

vi.mock("@/lib/server/memory", () => ({
    setUserMemory: vi.fn(),
    createProjectMemory: vi.fn().mockResolvedValue({ id: "pm-1" }),
    getProjectMemories: vi.fn().mockResolvedValue([]),
    getUserMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/server/memory/conflict-policy", () => ({
    normalizedMemoryKey: vi.fn((key: string) => key),
    normalizedMemoryValue: vi.fn((val: string) => val),
}));

vi.mock("@/lib/server/notes", () => ({
    createNote: vi.fn(),
    updateNote: vi.fn(),
    textToTipTapDoc: vi.fn((text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })),
    listNotes: vi.fn().mockResolvedValue([]),
    extractTextFromContent: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/server/ledger", () => ({
    upsertStudy: vi.fn(),
    updateStudy: vi.fn(),
}));

vi.mock("@/lib/server/drafts", () => ({
    getDraft: mocks.getDraft,
    saveDraft: mocks.saveDraft,
}));

vi.mock("@/lib/draftStorage", () => ({
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
    createDraftVersion: vi.fn(),
}));

const { undoArtifact, applyArtifact } = await import("@/lib/server/agent/artifacts");

// ── Helpers ────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Record<string, unknown> = {}) {
    return {
        id: "art-1",
        runId: "run-1",
        projectId: "proj-1",
        conversationId: null,
        userId: "u1",
        type: "protocol_suggestion",
        status: "proposed",
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
        ...overrides,
    };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("undoArtifact", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.update.mockResolvedValue({ id: "art-1", status: "rejected" });
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

    it("restores protocol_suggestion field to previous value on undo", async () => {
        const recentApply = new Date(Date.now() - 60_000); // 1 minute ago
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "protocol_suggestion",
            appliedAt: recentApply,
            snapshot: { field: "researchQuestion", previousValue: "Old RQ" },
            payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        }));

        await undoArtifact("art-1");

        // Should call prisma.protocol.update to restore
        expect(mocks.protocolUpdate).toHaveBeenCalledWith({
            where: { projectId: "proj-1" },
            data: { data: expect.objectContaining({ researchQuestion: "Old RQ" }) },
        });
        // Should mark artifact as rejected
        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: "art-1" },
            data: { status: "rejected", reviewNote: "Undone by user" },
        });
    });

    it("restores criteria_card eligibility on undo", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "criteria_card",
            appliedAt: recentApply,
            snapshot: { inclusion: ["Old inclusion"], exclusion: ["Old exclusion"] },
            payload: { inclusion: ["New inclusion"], exclusion: ["New exclusion"] },
        }));

        await undoArtifact("art-1");

        expect(mocks.protocolUpdate).toHaveBeenCalledWith({
            where: { projectId: "proj-1" },
            data: {
                data: expect.objectContaining({
                    eligibility: { inclusion: ["Old inclusion"], exclusion: ["Old exclusion"] },
                }),
            },
        });
    });

    it("restores study_update fields on undo", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        const studySnapshot = {
            id: "study-1",
            title: "Original Title",
            authors: "Author A",
            year: 2024,
            status: "pending",
            quality: "-",
            details: { doi: "10.1234/test" },
        };
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "study_update",
            appliedAt: recentApply,
            snapshot: studySnapshot,
            payload: { studyId: "study-1", studyTitle: "Original Title", snapshotAt: new Date().toISOString(), idempotencyKey: "k1", patch: { top: { quality: "High" } }, changes: [], rationale: "test" },
        }));

        const { prisma } = await import("@/lib/server/prisma");

        await undoArtifact("art-1");

        expect(prisma.study.update).toHaveBeenCalledWith({
            where: { id: "study-1" },
            data: expect.objectContaining({
                title: "Original Title",
                authors: "Author A",
                year: 2024,
                status: "pending",
                quality: "-",
            }),
        });
    });

    it("soft-deletes newly-created study on study_proposal undo when snapshot is null", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "study_proposal",
            appliedAt: recentApply,
            snapshot: null, // null means "study didn't exist before"
            payload: { title: "New Study", authors: "A", year: 2025, source: "pubmed", recommendation: "keep", confidence: 0.9 },
        }));
        mocks.findFirst.mockResolvedValue({ id: "study-new" });

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
            snapshot: previousContent,
            payload: { section: "Introduction", content: "New text", citations: [], wordCount: 2 },
        }));
        mocks.getDraft.mockResolvedValue({
            contentBySection: { introduction: { type: "doc", content: [] } },
        });

        await undoArtifact("art-1");

        expect(mocks.saveDraft).toHaveBeenCalledWith(
            undefined,
            "proj-1",
            expect.objectContaining({
                contentBySection: expect.objectContaining({
                    introduction: previousContent,
                }),
            }),
        );
    });

    it("marks unsupported type as rejected without restoring", async () => {
        const recentApply = new Date(Date.now() - 60_000);
        mocks.findUnique.mockResolvedValue(makeArtifact({
            type: "memory_proposal",
            appliedAt: recentApply,
            snapshot: { some: "data" },
        }));

        await undoArtifact("art-1");

        // No restore should happen — no study/protocol/draft writes
        expect(mocks.protocolUpdate).not.toHaveBeenCalled();
        expect(mocks.findFirst).not.toHaveBeenCalled();
        expect(mocks.saveDraft).not.toHaveBeenCalled();
        // But artifact should still be marked as rejected
        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: "art-1" },
            data: { status: "rejected", reviewNote: "Undone by user" },
        });
    });
});

describe("applyArtifact — snapshot capture", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.update.mockResolvedValue({ id: "art-1", status: "accepted", appliedAt: new Date() });
        mocks.emitEvent.mockResolvedValue({ id: "evt-1" });
    });

    it("captures protocol_suggestion snapshot before applying", async () => {
        const artifact = makeArtifact({
            type: "protocol_suggestion",
            status: "proposed",
            payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.protocolFindUnique.mockResolvedValue({
            data: { researchQuestion: "Old RQ", pico: {}, eligibility: { inclusion: [], exclusion: [] } },
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
        expect(snapshotData).toEqual({ field: "researchQuestion", previousValue: "Old RQ" });
    });

    it("captures criteria_card eligibility snapshot before applying", async () => {
        const artifact = makeArtifact({
            type: "criteria_card",
            status: "proposed",
            payload: { inclusion: ["New"], exclusion: ["New excl"] },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.protocolFindUnique.mockResolvedValue({
            data: {
                researchQuestion: "RQ",
                pico: {},
                eligibility: { inclusion: ["Original"], exclusion: ["Original excl"] },
            },
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
        expect(snapshotData).toEqual({ inclusion: ["Original"], exclusion: ["Original excl"] });
    });

    it("captures study_update snapshot before applying", async () => {
        const studyRow = {
            id: "study-1", title: "Title", authors: "A", year: 2024,
            status: "pending", quality: "-", details: { doi: "10.1234/x" },
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
        mocks.findFirst.mockResolvedValue(studyRow);

        await applyArtifact("art-1");

        const snapshotCall = mocks.update.mock.calls.find(
            (call: unknown[]) => {
                const arg = call[0] as { data?: { snapshot?: unknown } };
                return arg?.data?.snapshot !== undefined;
            }
        );
        expect(snapshotCall).toBeDefined();
        const snapshotData = (snapshotCall![0] as { data: { snapshot: unknown } }).data.snapshot;
        expect(snapshotData).toEqual(studyRow);
    });

    it("writes DbNull snapshot when entity does not exist (study_proposal)", async () => {
        const artifact = makeArtifact({
            type: "study_proposal",
            status: "proposed",
            payload: { title: "Brand New", authors: "B", year: 2025, source: "pubmed", recommendation: "keep", confidence: 0.9 },
        });
        mocks.findUnique.mockResolvedValue(artifact);
        mocks.findFirst.mockResolvedValue(null); // no existing study

        await applyArtifact("art-1");

        const snapshotCall = mocks.update.mock.calls.find(
            (call: unknown[]) => {
                const arg = call[0] as { data?: { snapshot?: unknown } };
                return arg?.data?.snapshot !== undefined;
            }
        );
        expect(snapshotCall).toBeDefined();
        // null maps to Prisma.DbNull
        expect((snapshotCall![0] as { data: { snapshot: unknown } }).data.snapshot).toBe("DbNull");
    });
});
