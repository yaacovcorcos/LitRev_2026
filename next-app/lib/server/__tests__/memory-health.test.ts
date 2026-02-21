import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMemoryQualityMetrics } from "../memory/memory-health";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        memoryRetrieval: { findMany: vi.fn() },
        projectMemory: {
            aggregate: vi.fn(),
            groupBy: vi.fn(),
            findMany: vi.fn(),
        },
        studyMemory: {
            aggregate: vi.fn(),
            findMany: vi.fn(),
        },
        userMemory: {
            aggregate: vi.fn(),
            groupBy: vi.fn(),
            findMany: vi.fn(),
        },
    },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockRetrievalFindMany = vi.mocked(prisma.memoryRetrieval.findMany);
const mockProjectAggregate = vi.mocked(prisma.projectMemory.aggregate);
const mockStudyAggregate = vi.mocked(prisma.studyMemory.aggregate);
const mockUserAggregate = vi.mocked(prisma.userMemory.aggregate);
const mockProjectGroupBy = vi.mocked(prisma.projectMemory.groupBy);
const mockUserGroupBy = vi.mocked(prisma.userMemory.groupBy);
const mockProjectFindMany = vi.mocked(prisma.projectMemory.findMany);
const mockStudyFindMany = vi.mocked(prisma.studyMemory.findMany);
const mockUserFindMany = vi.mocked(prisma.userMemory.findMany);

describe("memory health metrics", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRetrievalFindMany.mockResolvedValue([
            { memoryType: "project", memoryIds: ["p1", "p2"] },
            { memoryType: "user", memoryIds: ["u1"] },
        ] as any);
        mockProjectAggregate.mockResolvedValue({
            _sum: { retrievalCount: 10, usedInAnswerCount: 5, acceptedCount: 4, rejectedCount: 2, contradictionCount: 1 },
        } as any);
        mockStudyAggregate.mockResolvedValue({
            _sum: { retrievalCount: 0, usedInAnswerCount: 0, acceptedCount: 0, rejectedCount: 0, contradictionCount: 0 },
        } as any);
        mockUserAggregate.mockResolvedValue({
            _sum: { retrievalCount: 2, usedInAnswerCount: 1, acceptedCount: 1, rejectedCount: 0, contradictionCount: 0 },
        } as any);
        mockProjectGroupBy.mockResolvedValue([
            { source: "decision", _sum: { acceptedCount: 4, rejectedCount: 2 } },
        ] as any);
        mockUserGroupBy.mockResolvedValue([
            { source: "explicit", _sum: { acceptedCount: 1, rejectedCount: 0 } },
        ] as any);
        mockProjectFindMany.mockResolvedValue([
            { id: "p1", status: "active" },
            { id: "p2", status: "archived" },
        ] as any);
        mockUserFindMany.mockResolvedValue([{ id: "u1", status: "active" }] as any);
        mockStudyFindMany.mockResolvedValue([] as any);
    });

    it("computes core quality rates and source acceptance", async () => {
        const metrics = await getMemoryQualityMetrics("proj-1", "user-1");

        expect(metrics.retrievalHitRate).toBeGreaterThan(0);
        expect(metrics.staleMemoryUsageRate).toBeGreaterThan(0);
        expect(metrics.contradictionRate).toBeGreaterThan(0);
        expect(metrics.proposalAcceptanceBySource.length).toBeGreaterThan(0);
        expect(metrics.totals.retrievalEvents).toBe(2);
    });
});

