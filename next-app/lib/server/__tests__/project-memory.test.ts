import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    transaction: vi.fn(),
    embeddingDeleteMany: vi.fn(),
    projectDelete: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $transaction: mocks.transaction,
        memoryEmbedding: { deleteMany: mocks.embeddingDeleteMany },
        projectMemory: { delete: mocks.projectDelete },
    },
}));

const { deleteProjectMemory, updateProjectMemory } = await import("@/lib/server/memory/project-memory");

describe("project memory lifecycle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({
            memoryEmbedding: { deleteMany: mocks.embeddingDeleteMany },
            projectMemory: { delete: mocks.projectDelete },
        }));
        mocks.projectDelete.mockResolvedValue({ id: "pm-1" });
    });

    it("revising an active memory creates a new chain head and points the old row forward", async () => {
        const existing = {
            id: "pm-1",
            projectId: "proj-1",
            type: "decision",
            key: "screening_rule",
            category: null,
            statement: "Exclude case studies",
            rationale: "Low evidence",
            context: null,
            status: "active",
            source: "explicit_user",
            authority: "confirmed",
            polarity: "affirming",
            sourceRefType: null,
            sourceRefId: null,
            confidence: 1,
            retrievalCount: 0,
            usedInAnswerCount: 0,
            acceptedCount: 0,
            rejectedCount: 0,
            contradictionCount: 0,
            pinned: false,
            embeddingStatus: "ready",
            lastUsedAt: null,
            version: 2,
            supersededBy: null,
            tags: ["memory-key:screening_rule"],
            importance: "important",
            importanceRank: 20,
            createdAt: new Date(),
            updatedAt: new Date(),
            archivedAt: null,
        };
        const created = { ...existing, id: "pm-2", statement: "Exclude case reports", version: 1 };
        const projectMemory = {
            findUnique: vi.fn().mockResolvedValue(existing),
            create: vi.fn().mockResolvedValue(created),
            update: vi.fn()
                .mockResolvedValueOnce({ ...existing, status: "revised", supersededBy: "pm-2" })
                .mockResolvedValueOnce({ ...created, version: 3 }),
        };
        const memoryEmbedding = {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        };

        const result = await updateProjectMemory("pm-1", {
            statement: "Exclude case reports",
        }, { projectMemory, memoryEmbedding } as never);

        expect(projectMemory.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                key: "screening_rule",
                statement: "Exclude case reports",
                importanceRank: 20,
                embeddingStatus: "pending",
            }),
        }));
        expect(projectMemory.update).toHaveBeenCalledWith({
            where: { id: "pm-1" },
            data: {
                status: "revised",
                supersededBy: "pm-2",
                embeddingStatus: "pending",
            },
        });
        expect(memoryEmbedding.deleteMany).toHaveBeenCalledWith({
            where: { memoryType: "project", memoryId: "pm-1" },
        });
        expect(projectMemory.update).toHaveBeenLastCalledWith({
            where: { id: "pm-2" },
            data: { version: 3 },
        });
        expect(result).toMatchObject({ id: "pm-2", version: 3 });
    });

    it("purges semantic embeddings before hard-deleting a project memory", async () => {
        await deleteProjectMemory("pm-1");

        expect(mocks.embeddingDeleteMany).toHaveBeenCalledWith({
            where: { memoryType: "project", memoryId: "pm-1" },
        });
        expect(mocks.projectDelete).toHaveBeenCalledWith({ where: { id: "pm-1" } });
    });
});
