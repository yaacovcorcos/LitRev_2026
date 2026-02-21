import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMemoryMaintenance, utilityScore, shouldArchiveLowUtility } from "../memory/maintenance";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        userMemory: {
            findMany: vi.fn(),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        projectMemory: {
            findMany: vi.fn(),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        studyMemory: {
            findMany: vi.fn(),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
    },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockUserFindMany = vi.mocked(prisma.userMemory.findMany);
const mockProjectFindMany = vi.mocked(prisma.projectMemory.findMany);
const mockStudyFindMany = vi.mocked(prisma.studyMemory.findMany);
const mockUserUpdateMany = vi.mocked(prisma.userMemory.updateMany);
const mockProjectUpdateMany = vi.mocked(prisma.projectMemory.updateMany);
const mockStudyUpdateMany = vi.mocked(prisma.studyMemory.updateMany);

describe("memory maintenance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUserFindMany.mockResolvedValue([]);
        mockProjectFindMany.mockResolvedValue([]);
        mockStudyFindMany.mockResolvedValue([]);
    });

    it("archives only low-utility memories", async () => {
        mockProjectFindMany.mockResolvedValue([
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
        ] as any);

        const result = await runMemoryMaintenance({ projectId: "proj-1", dryRun: false });

        expect(result.candidates.project).toBe(1);
        expect(mockProjectUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: { in: ["p-low"] } },
        }));
    });

    it("supports dry-run without mutating memory rows", async () => {
        mockUserFindMany.mockResolvedValue([
            {
                id: "u-low",
                retrievalCount: 2,
                usedInAnswerCount: 0,
                acceptedCount: 0,
                rejectedCount: 2,
                contradictionCount: 0,
                pinned: false,
            },
        ] as any);

        const result = await runMemoryMaintenance({ userId: "user-1", dryRun: true });

        expect(result.candidates.user).toBe(1);
        expect(result.archived.user).toBe(0);
        expect(mockUserUpdateMany).not.toHaveBeenCalled();
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

