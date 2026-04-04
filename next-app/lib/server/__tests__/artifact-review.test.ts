import { beforeEach, describe, expect, it, vi } from "vitest";

type Store = {
    artifact: Record<string, unknown>;
    protocolData: Record<string, unknown>;
    draftState: { contentBySection: Record<string, unknown> } | null;
    draftVersions: Array<Record<string, unknown>>;
    notes: Array<Record<string, unknown>>;
    userMemories: Array<Record<string, unknown>>;
    projectMemories: Array<Record<string, unknown>>;
    studies: Array<Record<string, unknown>>;
};

const mocks = vi.hoisted(() => ({
    rootArtifactFindUnique: vi.fn(),
    rootArtifactUpdate: vi.fn(),
    transaction: vi.fn(),
    emitEventWithinTransaction: vi.fn(),
    createArtifactCheckpointInTransaction: vi.fn(),
    markRunDurabilityDegraded: vi.fn(),
    noteObservedRunActivity: vi.fn(),
    syncProtocolToMemory: vi.fn(),
    logServerError: vi.fn(),
    logServerWarn: vi.fn(),
    validateFieldValue: vi.fn(),
    isValidFieldPath: vi.fn(),
    saveProtocolTrusted: vi.fn(),
    ensureProtocolWithDb: vi.fn(),
    setUserMemoryWithDb: vi.fn(),
    createProjectMemoryWithDb: vi.fn(),
    getProjectMemories: vi.fn(),
    getUserMemories: vi.fn(),
    createNoteTrusted: vi.fn(),
    updateNoteTrusted: vi.fn(),
    listNotesTrusted: vi.fn(),
    upsertStudyTrusted: vi.fn(),
    updateStudyTrusted: vi.fn(),
    createDraftVersionTrusted: vi.fn(),
    getDraftTrusted: vi.fn(),
    saveDraftTrusted: vi.fn(),
    onStudyAccepted: vi.fn(),
    onStudyExcluded: vi.fn(),
    onDraftAccepted: vi.fn(),
    onArtifactEdited: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $transaction: mocks.transaction,
        artifact: {
            findUnique: mocks.rootArtifactFindUnique,
            update: mocks.rootArtifactUpdate,
        },
    },
}));

vi.mock("@/lib/server/agent/events", () => ({
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
    onStudyAccepted: mocks.onStudyAccepted,
    onStudyExcluded: mocks.onStudyExcluded,
    onDraftAccepted: mocks.onDraftAccepted,
    onArtifactEdited: mocks.onArtifactEdited,
}));

vi.mock("@/lib/server/memory/protocol-sync", () => ({
    syncProtocolToMemory: mocks.syncProtocolToMemory,
}));

vi.mock("@/lib/server/logging", () => ({
    logServerError: mocks.logServerError,
    logServerWarn: mocks.logServerWarn,
}));

vi.mock("@/lib/server/protocols", () => ({
    ensureProtocolWithDb: mocks.ensureProtocolWithDb,
    saveProtocolTrusted: mocks.saveProtocolTrusted,
}));

vi.mock("@/lib/protocol-fields", () => ({
    validateFieldValue: mocks.validateFieldValue,
    isValidFieldPath: mocks.isValidFieldPath,
}));

vi.mock("@/lib/server/memory", () => ({
    setUserMemoryWithDb: mocks.setUserMemoryWithDb,
    createProjectMemoryWithDb: mocks.createProjectMemoryWithDb,
    getProjectMemories: mocks.getProjectMemories,
    getUserMemories: mocks.getUserMemories,
}));

vi.mock("@/lib/server/memory/conflict-policy", () => ({
    normalizedMemoryKey: vi.fn((key: string) => key.trim().toLowerCase()),
    normalizedMemoryValue: vi.fn((value: string) => value.trim()),
}));

vi.mock("@/lib/server/notes", () => ({
    createNoteTrusted: mocks.createNoteTrusted,
    updateNoteTrusted: mocks.updateNoteTrusted,
    textToTipTapDoc: vi.fn((text: string) => ({ type: "doc", markdown: text })),
    listNotesTrusted: mocks.listNotesTrusted,
    extractTextFromContent: vi.fn(() => ""),
}));

vi.mock("@/lib/server/ledger", () => ({
    upsertStudyTrusted: mocks.upsertStudyTrusted,
    updateStudyTrusted: mocks.updateStudyTrusted,
}));

vi.mock("@/lib/server/draft-versions", () => ({
    createDraftVersionTrusted: mocks.createDraftVersionTrusted,
}));

vi.mock("@/lib/server/drafts", () => ({
    getDraftTrusted: mocks.getDraftTrusted,
    saveDraftTrusted: mocks.saveDraftTrusted,
}));

vi.mock("@/lib/draft-storage", () => ({
    createDefaultDraftState: vi.fn(() => ({
        contentBySection: {},
    })),
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
    const original = await importOriginal<typeof import("@/types/artifacts")>();
    return {
        ...original,
        ARTIFACT_PAYLOAD_SCHEMAS: {},
    };
});

vi.mock("@prisma/client", () => ({
    Prisma: {
        DbNull: "DbNull",
        sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
        join: (values: unknown[]) => values,
    },
}));

const { reviewArtifact, applyArtifact } = await import("@/lib/server/agent/artifacts");

function cloneStore<T>(value: T): T {
    return structuredClone(value);
}

function makeArtifact(overrides: Record<string, unknown> = {}) {
    return {
        id: "art-1",
        runId: "run-1",
        projectId: "proj-1",
        conversationId: "conv-1",
        userId: "user-1",
        type: "draft_diff",
        status: "proposed",
        title: "Artifact Title",
        payload: {},
        snapshot: null,
        version: 1,
        sourceEventId: null,
        applyId: null,
        appliedAt: null,
        appliedByUserId: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
        project: {
            ownerId: "owner-1",
            workspaceId: "workspace-1",
        },
        ...overrides,
    };
}

function makeStore(overrides: Partial<Store> = {}): Store {
    return {
        artifact: makeArtifact(),
        protocolData: {
            researchQuestion: "Old RQ",
            pico: { population: "Adults", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: ["English"], exclusion: ["Animals"] },
        },
        draftState: {
            contentBySection: {
                introduction: { type: "doc", markdown: "Old introduction" },
            },
        },
        draftVersions: [],
        notes: [],
        userMemories: [],
        projectMemories: [],
        studies: [],
        ...overrides,
    };
}

function getStoreFromDb(db: unknown): Store {
    return (db as { __store: Store }).__store;
}

function applyArtifactUpdate(store: Store, data: Record<string, unknown>) {
    store.artifact = {
        ...store.artifact,
        ...data,
        snapshot: data.snapshot === "DbNull" ? null : data.snapshot ?? store.artifact.snapshot,
    };
    return cloneStore(store.artifact);
}

function findStudy(store: Store, where: Record<string, unknown>) {
    return store.studies.find((study) => {
        if (where.id && study.id !== where.id) return false;
        if (where.projectId && study.projectId !== where.projectId) return false;
        if (where.title && study.title !== where.title) return false;
        if (Object.prototype.hasOwnProperty.call(where, "deletedAt")) {
            if ((where.deletedAt ?? null) !== (study.deletedAt ?? null)) return false;
        }
        return true;
    }) ?? null;
}

function createTx(store: Store) {
    return {
        __store: store,
        artifact: {
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
                where.id === store.artifact.id ? cloneStore(store.artifact) : null
            ),
            update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                if (where.id !== store.artifact.id) throw new Error("Artifact not found");
                return applyArtifactUpdate(store, data);
            }),
        },
        study: {
            findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => cloneStore(findStudy(store, where))),
            update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const study = store.studies.find((entry) => entry.id === where.id);
                if (!study) throw new Error("Study not found");
                Object.assign(study, data);
                return cloneStore(study);
            }),
        },
        protocol: {
            findUnique: vi.fn(async ({ where }: { where: { projectId: string } }) =>
                where.projectId === (store.artifact.projectId as string)
                    ? { data: cloneStore(store.protocolData) }
                    : null
            ),
        },
        userMemory: {
            updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const ids = (where.id as { in?: string[] } | undefined)?.in ?? [];
                let count = 0;
                for (const memory of store.userMemories) {
                    if (!ids.includes(String(memory.id))) continue;
                    if (where.userId && memory.userId !== where.userId) continue;
                    if (where.status && memory.status !== where.status) continue;
                    Object.assign(memory, data);
                    count += 1;
                }
                return { count };
            }),
        },
        projectMemory: {
            update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const memory = store.projectMemories.find((entry) => entry.id === where.id);
                if (!memory) throw new Error("Project memory not found");
                Object.assign(memory, data);
                return cloneStore(memory);
            }),
            updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const ids = (where.id as { in?: string[] } | undefined)?.in ?? [];
                let count = 0;
                for (const memory of store.projectMemories) {
                    if (!ids.includes(String(memory.id))) continue;
                    if (where.projectId && memory.projectId !== where.projectId) continue;
                    if (where.status && memory.status !== where.status) continue;
                    Object.assign(memory, data);
                    count += 1;
                }
                return { count };
            }),
        },
        $executeRaw: vi.fn(async () => 1),
    };
}

function installTransactionalStore(store: Store) {
    mocks.rootArtifactFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === store.artifact.id ? cloneStore(store.artifact) : null
    );
    mocks.rootArtifactUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (where.id !== store.artifact.id) throw new Error("Artifact not found");
        return applyArtifactUpdate(store, data);
    });

    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const txStore = cloneStore(store);
        const tx = createTx(txStore);
        try {
            const result = await callback(tx);
            store.artifact = txStore.artifact;
            store.protocolData = txStore.protocolData;
            store.draftState = txStore.draftState;
            store.draftVersions = txStore.draftVersions;
            store.notes = txStore.notes;
            store.userMemories = txStore.userMemories;
            store.projectMemories = txStore.projectMemories;
            store.studies = txStore.studies;
            return result;
        } catch (error) {
            throw error;
        }
    });
}

describe("artifact review/apply hardening", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.emitEventWithinTransaction.mockResolvedValue({
            sequence: 11,
            createdAt: new Date("2026-03-20T10:01:00.000Z"),
        });
        mocks.createArtifactCheckpointInTransaction.mockResolvedValue(undefined);
        mocks.markRunDurabilityDegraded.mockResolvedValue(1);
        mocks.noteObservedRunActivity.mockReturnValue(undefined);
        mocks.syncProtocolToMemory.mockResolvedValue(undefined);
        mocks.validateFieldValue.mockImplementation((_field: string, value: unknown) => ({ valid: true, value }));
        mocks.isValidFieldPath.mockReturnValue(true);

        mocks.ensureProtocolWithDb.mockImplementation(async (db: unknown) => cloneStore(getStoreFromDb(db).protocolData));
        mocks.saveProtocolTrusted.mockImplementation(async (db: unknown, _projectId: string, data: Record<string, unknown>) => {
            getStoreFromDb(db).protocolData = cloneStore(data);
        });

        mocks.getDraftTrusted.mockImplementation(async (db: unknown) => cloneStore(getStoreFromDb(db).draftState));
        mocks.saveDraftTrusted.mockImplementation(async (
            db: unknown,
            _projectId: string,
            draftState: { contentBySection: Record<string, unknown> },
        ) => {
            getStoreFromDb(db).draftState = cloneStore(draftState);
        });
        mocks.createDraftVersionTrusted.mockImplementation(async (db: unknown, input: Record<string, unknown>) => {
            getStoreFromDb(db).draftVersions.push({ id: `dv-${getStoreFromDb(db).draftVersions.length + 1}`, ...cloneStore(input) });
        });

        mocks.listNotesTrusted.mockImplementation(async (db: unknown) => cloneStore(getStoreFromDb(db).notes));
        mocks.createNoteTrusted.mockImplementation(async (db: unknown, input: Record<string, unknown>) => {
            const store = getStoreFromDb(db);
            store.notes.push({ id: `note-${store.notes.length + 1}`, ...cloneStore(input) });
        });
        mocks.updateNoteTrusted.mockImplementation(async (db: unknown, noteId: string, input: Record<string, unknown>) => {
            const store = getStoreFromDb(db);
            const note = store.notes.find((entry) => entry.id === noteId);
            if (!note) throw new Error("Note not found");
            Object.assign(note, cloneStore(input));
        });

        mocks.getUserMemories.mockImplementation(async (userId: string, filter: Record<string, unknown> | undefined, db: unknown) =>
            cloneStore(
                getStoreFromDb(db).userMemories.filter((memory) =>
                    memory.userId === userId && (!filter?.status || memory.status === filter.status)
                ),
            )
        );
        mocks.setUserMemoryWithDb.mockImplementation(async (db: unknown, input: Record<string, unknown>) => {
            const store = getStoreFromDb(db);
            store.userMemories.push({
                id: `um-${store.userMemories.length + 1}`,
                status: "active",
                ...cloneStore(input),
            });
        });

        mocks.getProjectMemories.mockImplementation(async (projectId: string, filter: Record<string, unknown> | undefined, db: unknown) =>
            cloneStore(
                getStoreFromDb(db).projectMemories.filter((memory) => {
                    if (memory.projectId !== projectId) return false;
                    if (filter?.status && memory.status !== filter.status) return false;
                    if (filter?.tags) {
                        const tags = Array.isArray(memory.tags) ? memory.tags : [];
                        return (filter.tags as string[]).every((tag) => tags.includes(tag));
                    }
                    return true;
                }),
            )
        );
        mocks.createProjectMemoryWithDb.mockImplementation(async (db: unknown, input: Record<string, unknown>) => {
            const store = getStoreFromDb(db);
            const created = {
                id: `pm-${store.projectMemories.length + 1}`,
                status: "active",
                ...cloneStore(input),
            };
            store.projectMemories.push(created);
            return cloneStore(created);
        });

        mocks.updateStudyTrusted.mockImplementation(async (db: unknown, projectId: string, _workspaceId: string, studyId: string, patch: Record<string, unknown>) => {
            const store = getStoreFromDb(db);
            const study = store.studies.find((entry) => entry.id === studyId && entry.projectId === projectId);
            if (!study) throw new Error(`Study not found: ${studyId}`);
            Object.assign(study, cloneStore(patch));
            return cloneStore(study);
        });
        mocks.upsertStudyTrusted.mockImplementation(async (db: unknown, projectId: string, _workspaceId: string, input: Record<string, unknown>) => {
            const store = getStoreFromDb(db);
            const created = {
                id: String(input.id ?? `study-${store.studies.length + 1}`),
                deletedAt: null,
                projectId,
                ...cloneStore(input),
            };
            store.studies.push(created);
            return cloneStore(created);
        });
    });

    it("wraps snapshot failures as typed apply errors and leaves manual review pending", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "draft_diff",
                title: "Draft revision",
                payload: { section: "Introduction", content: "New introduction", citations: [], wordCount: 2 },
            }),
        });
        installTransactionalStore(store);
        mocks.getDraftTrusted.mockRejectedValueOnce(new Error("draft snapshot failed"));

        await expect(
            reviewArtifact("art-1", "accepted", undefined, undefined, { actorUserId: "user-1" }),
        ).rejects.toMatchObject({ errorCode: "ARTIFACT_APPLY_FAILED" });

        expect(store.artifact.status).toBe("proposed");
        expect(store.artifact.appliedAt).toBeNull();
        expect(store.draftVersions).toHaveLength(0);
        expect(mocks.saveDraftTrusted).not.toHaveBeenCalled();
        expect(mocks.markRunDurabilityDegraded).not.toHaveBeenCalled();
    });

    it("rolls back protocol changes and marks durability degraded when event persistence fails", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "protocol_suggestion",
                title: "Protocol: researchQuestion",
                payload: { field: "researchQuestion", value: "New RQ", rationale: "Clarify scope" },
            }),
        });
        installTransactionalStore(store);
        mocks.emitEventWithinTransaction.mockRejectedValueOnce(new Error("event boundary failed"));

        await expect(
            reviewArtifact("art-1", "accepted", undefined, undefined, { actorUserId: "user-1" }),
        ).rejects.toMatchObject({ errorCode: "ARTIFACT_APPLY_FAILED" });

        expect(store.protocolData.researchQuestion).toBe("Old RQ");
        expect(store.artifact.status).toBe("proposed");
        expect(store.artifact.appliedAt).toBeNull();
        expect(mocks.markRunDurabilityDegraded).toHaveBeenCalledWith(
            "run-1",
            "artifact_review_checkpoint_persistence_failed",
        );
        expect(mocks.syncProtocolToMemory).not.toHaveBeenCalled();
    });

    it("rolls back draft writes when checkpoint persistence fails", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "draft_diff",
                title: "Draft revision",
                payload: { section: "Introduction", content: "New introduction", citations: [], wordCount: 2 },
            }),
        });
        installTransactionalStore(store);
        mocks.createArtifactCheckpointInTransaction.mockRejectedValueOnce(new Error("checkpoint failed"));

        await expect(
            reviewArtifact("art-1", "accepted", undefined, undefined, { actorUserId: "user-1" }),
        ).rejects.toMatchObject({ errorCode: "ARTIFACT_APPLY_FAILED" });

        expect(store.draftState?.contentBySection.introduction).toEqual({ type: "doc", markdown: "Old introduction" });
        expect(store.draftVersions).toHaveLength(0);
        expect(store.artifact.status).toBe("proposed");
        expect(mocks.markRunDurabilityDegraded).toHaveBeenCalledWith(
            "run-1",
            "artifact_review_checkpoint_persistence_failed",
        );
    });

    it("accepts draft diffs by creating a draft version and updating the canonical draft", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "draft_diff",
                title: "Draft revision",
                payload: { section: "Introduction", content: "New introduction", citations: [], wordCount: 2 },
            }),
        });
        installTransactionalStore(store);

        const reviewed = await reviewArtifact("art-1", "accepted", "Looks good", undefined, { actorUserId: "user-1" });

        expect(reviewed.status).toBe("accepted");
        expect(store.draftVersions).toHaveLength(1);
        expect(store.draftVersions[0]).toMatchObject({
            artifactId: "art-1",
            projectId: "proj-1",
            section: "Introduction",
            wordCount: 2,
        });
        expect(store.draftState?.contentBySection.introduction).toEqual({
            type: "doc",
            markdown: "New introduction",
        });
        expect(store.artifact.status).toBe("accepted");
        expect(store.artifact.appliedByUserId).toBe("user-1");
    });

    it("updates an existing evidence-table note on acceptance", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "evidence_table",
                title: "Evidence table",
                payload: {
                    columns: ["Study", "Outcome"],
                    rows: [{ Study: "Trial A", Outcome: "Improved" }],
                },
            }),
            notes: [{
                id: "note-1",
                title: "Evidence Table",
                linkedSection: "Evidence Table",
                tags: ["existing"],
                content: { type: "doc", markdown: "Old table" },
            }],
        });
        installTransactionalStore(store);

        await reviewArtifact("art-1", "accepted", undefined, undefined, { actorUserId: "user-1" });

        expect(store.notes).toHaveLength(1);
        expect(store.notes[0]).toMatchObject({
            id: "note-1",
            title: "Evidence Table",
            linkedSection: "Evidence Table",
        });
        expect(store.notes[0].tags).toEqual(expect.arrayContaining(["existing", "evidence-table"]));
        expect(store.notes[0].content).toEqual(expect.objectContaining({
            markdown: expect.stringContaining("## Evidence Table"),
        }));
    });

    it("archives matching project memories for memory-forget proposals", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "memory_forget_proposal",
                title: "Forget project memories",
                payload: {
                    memoryType: "project",
                    matches: [{ id: "pm-1" }, { id: "pm-2" }],
                    rationale: "Superseded by new rule",
                },
            }),
            projectMemories: [
                { id: "pm-1", projectId: "proj-1", status: "active", statement: "Old rule", tags: [] },
                { id: "pm-2", projectId: "proj-1", status: "active", statement: "Older rule", tags: [] },
            ],
        });
        installTransactionalStore(store);

        await reviewArtifact("art-1", "accepted", undefined, undefined, { actorUserId: "user-1" });

        expect(store.projectMemories.every((memory) => memory.status === "archived")).toBe(true);
        expect(store.projectMemories.every((memory) => memory.archivedAt instanceof Date)).toBe(true);
    });

    it("uses the artifact user as execution context for auto-applied user memories", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "memory_proposal",
                status: "proposed",
                userId: "user-7",
                title: "Remember user preference",
                payload: {
                    memoryType: "user",
                    key: "focus_rule",
                    value: "Prefer exclusion criteria with explicit population mismatch.",
                    rationale: "Observed across accepted reviews",
                },
            }),
        });
        installTransactionalStore(store);

        const applied = await applyArtifact("art-1", "auto_applied");

        expect(applied.status).toBe("auto_applied");
        expect(store.userMemories).toHaveLength(1);
        expect(store.userMemories[0]).toMatchObject({
            userId: "user-7",
            key: "focus_rule",
            value: "Prefer exclusion criteria with explicit population mismatch.",
            status: "active",
        });
    });

    it("fails with typed context errors when user-memory execution has no acting user", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "memory_proposal",
                userId: null,
                title: "Remember user preference",
                payload: {
                    memoryType: "user",
                    key: "focus_rule",
                    value: "Keep stronger population constraints.",
                    rationale: "Observed across accepted reviews",
                },
            }),
        });
        installTransactionalStore(store);

        await expect(applyArtifact("art-1", "auto_applied")).rejects.toMatchObject({
            errorCode: "ARTIFACT_CONTEXT_MISSING",
        });

        expect(store.userMemories).toHaveLength(0);
    });

    it("keeps protocol-to-memory sync post-commit and non-fatal for successful reviews", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "protocol_suggestion",
                title: "Protocol: researchQuestion",
                payload: { field: "researchQuestion", value: "New RQ", rationale: "Clarify scope" },
            }),
        });
        installTransactionalStore(store);
        mocks.syncProtocolToMemory.mockRejectedValueOnce(new Error("sync failed"));

        const reviewed = await reviewArtifact("art-1", "accepted", undefined, undefined, { actorUserId: "user-1" });

        expect(reviewed.status).toBe("accepted");
        expect(store.protocolData.researchQuestion).toBe("New RQ");
        expect(mocks.syncProtocolToMemory).toHaveBeenCalledWith("proj-1", expect.objectContaining({
            researchQuestion: "New RQ",
        }));
        expect(mocks.logServerError).toHaveBeenCalledWith(
            "artifacts",
            "artifact post-commit task failed",
            expect.objectContaining({
                artifactId: "art-1",
                runId: "run-1",
                task: "sync_protocol_to_memory",
            }),
            expect.any(Error),
        );
    });

    it("applies criteria-card updates through the trusted protocol path", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "criteria_card",
                title: "Eligibility update",
                payload: {
                    inclusion: ["Adults only"],
                    exclusion: ["Animal studies"],
                },
            }),
        });
        installTransactionalStore(store);

        await reviewArtifact("art-1", "accepted", undefined, undefined, { actorUserId: "user-1" });

        expect(store.protocolData.eligibility).toEqual({
            inclusion: ["Adults only"],
            exclusion: ["Animal studies"],
        });
        expect(mocks.syncProtocolToMemory).toHaveBeenCalledWith("proj-1", expect.objectContaining({
            eligibility: {
                inclusion: ["Adults only"],
                exclusion: ["Animal studies"],
            },
        }));
    });

    it("uses typed apply errors for generic handler failures", async () => {
        const store = makeStore({
            artifact: makeArtifact({
                type: "protocol_suggestion",
                title: "Protocol: researchQuestion",
                payload: { field: "researchQuestion", value: "New RQ", rationale: "Clarify scope" },
            }),
        });
        installTransactionalStore(store);
        mocks.saveProtocolTrusted.mockRejectedValueOnce(new Error("database connection dropped"));

        await expect(
            reviewArtifact("art-1", "accepted", undefined, undefined, { actorUserId: "user-1" }),
        ).rejects.toMatchObject({ errorCode: "ARTIFACT_APPLY_FAILED" });

        expect(store.protocolData.researchQuestion).toBe("Old RQ");
        expect(store.artifact.status).toBe("proposed");
    });
});
