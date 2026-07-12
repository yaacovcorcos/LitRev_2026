import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMemoryMaintenance, utilityScore, shouldArchiveLowUtility } from "../memory/maintenance";

const prismaMocks = vi.hoisted(() => {
    const mocks = {
        userFindMany: vi.fn(),
        userUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
        projectFindMany: vi.fn(),
        projectUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
        studyFindMany: vi.fn(),
        studyUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
        memoryEmbeddingDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        transaction: vi.fn(),
    };

    mocks.transaction = vi.fn(async (callback) => callback({
        memoryEmbedding: { deleteMany: mocks.memoryEmbeddingDeleteMany },
        userMemory: { updateMany: mocks.userUpdateMany },
        projectMemory: { updateMany: mocks.projectUpdateMany },
        studyMemory: { updateMany: mocks.studyUpdateMany },
    }));

    return mocks;
});

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $transaction: prismaMocks.transaction,
        memoryEmbedding: {
            deleteMany: prismaMocks.memoryEmbeddingDeleteMany,
        },
        userMemory: {
            findMany: prismaMocks.userFindMany,
            updateMany: prismaMocks.userUpdateMany,
        },
        projectMemory: {
            findMany: prismaMocks.projectFindMany,
            updateMany: prismaMocks.projectUpdateMany,
        },
        studyMemory: {
            findMany: prismaMocks.studyFindMany,
            updateMany: prismaMocks.studyUpdateMany,
        },
    },
}));

const { prisma } = await import("@/lib/server/prisma");

type UserFindManyResult = Awaited<ReturnType<typeof prisma.userMemory.findMany>>;
type ProjectFindManyResult = Awaited<ReturnType<typeof prisma.projectMemory.findMany>>;
type StudyFindManyResult = Awaited<ReturnType<typeof prisma.studyMemory.findMany>>;

const mockUserFindMany = vi.mocked(prisma.userMemory.findMany);
const mockProjectFindMany = vi.mocked(prisma.projectMemory.findMany);
const mockStudyFindMany = vi.mocked(prisma.studyMemory.findMany);
const mockUserUpdateMany = vi.mocked(prisma.userMemory.updateMany);
const mockProjectUpdateMany = vi.mocked(prisma.projectMemory.updateMany);
const mockMemoryEmbeddingDeleteMany = vi.mocked(prisma.memoryEmbedding.deleteMany);

function asUserFindManyResult(rows: unknown): UserFindManyResult {
    return rows as UserFindManyResult;
}

function asProjectFindManyResult(rows: unknown): ProjectFindManyResult {
    return rows as ProjectFindManyResult;
}

function asStudyFindManyResult(rows: unknown): StudyFindManyResult {
    return rows as StudyFindManyResult;
}

describe("memory maintenance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUserFindMany.mockResolvedValue([]);
        mockProjectFindMany.mockResolvedValue([]);
        mockStudyFindMany.mockResolvedValue(asStudyFindManyResult([]));
    });

    it("archives only low-utility memories", async () => {
        mockProjectFindMany.mockResolvedValue(asProjectFindManyResult([
            {
                id: "p-low",
                retrievalCount: 4,
                usedInAnswerCount: 0,
                acceptedCount: 0,
                rejectedCount: 2,
                contradictionCount: 1,
                pinned: false,
            },
            {
                id: "p-keep",
                retrievalCount: 4,
                usedInAnswerCount: 2,
                acceptedCount: 1,
                rejectedCount: 0,
                contradictionCount: 0,
                pinned: false,
            },
        ]));

        const result = await runMemoryMaintenance({ projectId: "proj-1", dryRun: false });

        expect(result.candidates.project).toBe(1);
        expect(mockProjectUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: { in: ["p-low"] } },
        }));
        expect(mockMemoryEmbeddingDeleteMany).toHaveBeenCalledWith({
            where: { memoryType: "project", memoryId: { in: ["p-low"] } },
        });
    });

    it("supports dry-run without mutating memory rows", async () => {
        mockUserFindMany.mockResolvedValue(asUserFindManyResult([
            {
                id: "u-low",
                retrievalCount: 2,
                usedInAnswerCount: 0,
                acceptedCount: 0,
                rejectedCount: 2,
                contradictionCount: 0,
                pinned: false,
            },
        ]));

        const result = await runMemoryMaintenance({ userId: "user-1", dryRun: true });

        expect(result.candidates.user).toBe(1);
        expect(result.archived.user).toBe(0);
        expect(mockUserUpdateMany).not.toHaveBeenCalled();
    });

    it("does not enter a maintenance write transaction after cancellation", async () => {
        const controller = new AbortController();
        prismaMocks.projectFindMany.mockImplementationOnce(async () => {
            controller.abort();
            return asProjectFindManyResult([{
                id: "p-low",
                retrievalCount: 0,
                usedInAnswerCount: 0,
                acceptedCount: 0,
                rejectedCount: 2,
                contradictionCount: 0,
                pinned: false,
            }]);
        });

        await expect(runMemoryMaintenance({
            projectId: "proj-1",
            signal: controller.signal,
        })).rejects.toMatchObject({ name: "AbortError" });

        expect(prismaMocks.transaction).not.toHaveBeenCalled();
        expect(mockProjectUpdateMany).not.toHaveBeenCalled();
    });

    it("utility scoring prefers accepted/used memories", () => {
        const weak = utilityScore({
            id: "m1",
            retrievalCount: 3,
            usedInAnswerCount: 0,
            acceptedCount: 0,
            rejectedCount: 2,
            contradictionCount: 1,
            pinned: false,
        });
        const strong = utilityScore({
            id: "m2",
            retrievalCount: 3,
            usedInAnswerCount: 2,
            acceptedCount: 2,
            rejectedCount: 0,
            contradictionCount: 0,
            pinned: false,
        });

        expect(strong).toBeGreaterThan(weak);
        expect(shouldArchiveLowUtility({
            id: "m1",
            retrievalCount: 3,
            usedInAnswerCount: 0,
            acceptedCount: 0,
            rejectedCount: 2,
            contradictionCount: 1,
            pinned: false,
        })).toBe(true);
    });
});
