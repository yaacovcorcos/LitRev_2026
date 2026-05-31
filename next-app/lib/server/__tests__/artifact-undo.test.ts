import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    transaction: vi.fn(),
    studyUpdate: vi.fn(),
    protocolUpsert: vi.fn(),
    protocolFindUnique: vi.fn(),
    executeRaw: vi.fn(),
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
    syncProtocolToMemory: vi.fn(),
}));

vi.mock("@/lib/server/protocols", () => ({
    ensureProtocolWithDb: vi.fn().mockResolvedValue({
        researchQuestion: "Old RQ",
        pico: { population: "adults", intervention: "", comparison: "", outcome: "" },
        eligibility: { inclusion: ["English"], exclusion: ["animals"] },
    }),
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
        },
        protocol: {
            findUnique: mocks.protocolFindUnique,
        },
        userMemory: {
            updateMany: mocks.userMemoryUpdateMany,
        },
        projectMemory: {
            update: mocks.projectMemoryUpdate,
            updateMany: mocks.projectMemoryUpdateMany,
        },
        $executeRaw: mocks.executeRaw,
    };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("undoArtifact", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.update.mockResolvedValue({ id: "art-1", status: "rejected" });
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
        mocks.executeRaw.mockResolvedValue(1);
        mocks.userMemoryUpdateMany.mockResolvedValue({ count: 0 });
        mocks.projectMemoryUpdate.mockResolvedValue(undefined);
        mocks.projectMemoryUpdateMany.mockResolvedValue({ count: 0 });
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
            snapshot: { field: "researchQuestion", previousValue: "Old RQ" },
            payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        }));

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
            snapshot: { field: "researchQuestion", previousValue: "Old RQ" },
            payload: { field: "researchQuestion", value: "New RQ", rationale: "test" },
        }));

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

        expect(mocks.protocolUpsert).toHaveBeenCalledWith(
            expect.any(Object),
            "proj-1",
            expect.objectContaining({
                eligibility: { inclusion: ["Old inclusion"], exclusion: ["Old exclusion"] },
            }),
        );
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
            expect.any(Object),
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
        expect(mocks.protocolUpsert).not.toHaveBeenCalled();
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
