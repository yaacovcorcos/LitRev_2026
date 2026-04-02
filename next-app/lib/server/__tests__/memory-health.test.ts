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

type RetrievalFindManyResult = Awaited<ReturnType<typeof prisma.memoryRetrieval.findMany>>;
type ProjectAggregateResult = Awaited<ReturnType<typeof prisma.projectMemory.aggregate>>;
type StudyAggregateResult = Awaited<ReturnType<typeof prisma.studyMemory.aggregate>>;
type UserAggregateResult = Awaited<ReturnType<typeof prisma.userMemory.aggregate>>;
type ProjectGroupByResult = Awaited<ReturnType<typeof prisma.projectMemory.groupBy>>;
type UserGroupByResult = Awaited<ReturnType<typeof prisma.userMemory.groupBy>>;
type ProjectFindManyResult = Awaited<ReturnType<typeof prisma.projectMemory.findMany>>;
type StudyFindManyResult = Awaited<ReturnType<typeof prisma.studyMemory.findMany>>;
type UserFindManyResult = Awaited<ReturnType<typeof prisma.userMemory.findMany>>;

const mockRetrievalFindMany = vi.mocked(prisma.memoryRetrieval.findMany);
const mockProjectAggregate = vi.mocked(prisma.projectMemory.aggregate);
const mockStudyAggregate = vi.mocked(prisma.studyMemory.aggregate);
const mockUserAggregate = vi.mocked(prisma.userMemory.aggregate);
const mockProjectGroupBy = vi.mocked(prisma.projectMemory.groupBy);
const mockUserGroupBy = vi.mocked(prisma.userMemory.groupBy);
const mockProjectFindMany = vi.mocked(prisma.projectMemory.findMany);
const mockStudyFindMany = vi.mocked(prisma.studyMemory.findMany);
const mockUserFindMany = vi.mocked(prisma.userMemory.findMany);

function asRetrievalFindManyResult(rows: unknown): RetrievalFindManyResult {
    return rows as RetrievalFindManyResult;
}

function asProjectAggregateResult(result: unknown): ProjectAggregateResult {
    return result as ProjectAggregateResult;
}

function asStudyAggregateResult(result: unknown): StudyAggregateResult {
    return result as StudyAggregateResult;
}

function asUserAggregateResult(result: unknown): UserAggregateResult {
    return result as UserAggregateResult;
}

function asProjectGroupByResult(rows: unknown): ProjectGroupByResult {
    return rows as ProjectGroupByResult;
}

function asUserGroupByResult(rows: unknown): UserGroupByResult {
    return rows as UserGroupByResult;
}

function asProjectFindManyResult(rows: unknown): ProjectFindManyResult {
    return rows as ProjectFindManyResult;
}

function asStudyFindManyResult(rows: unknown): StudyFindManyResult {
    return rows as StudyFindManyResult;
}

function asUserFindManyResult(rows: unknown): UserFindManyResult {
    return rows as UserFindManyResult;
}

describe("memory health metrics", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRetrievalFindMany.mockResolvedValue(asRetrievalFindManyResult([
            { memoryType: "project", memoryIds: ["p1", "p2"] },
            { memoryType: "user", memoryIds: ["u1"] },
        ]));
        mockProjectAggregate.mockResolvedValue(asProjectAggregateResult({
            _sum: { retrievalCount: 10, usedInAnswerCount: 5, acceptedCount: 4, rejectedCount: 2, contradictionCount: 1 },
        }));
        mockStudyAggregate.mockResolvedValue(asStudyAggregateResult({
            _sum: { retrievalCount: 0, usedInAnswerCount: 0, acceptedCount: 0, rejectedCount: 0, contradictionCount: 0 },
        }));
        mockUserAggregate.mockResolvedValue(asUserAggregateResult({
            _sum: { retrievalCount: 2, usedInAnswerCount: 1, acceptedCount: 1, rejectedCount: 0, contradictionCount: 0 },
        }));
        mockProjectGroupBy.mockResolvedValue(asProjectGroupByResult([
            { source: "decision", _sum: { acceptedCount: 4, rejectedCount: 2 } },
        ]));
        mockUserGroupBy.mockResolvedValue(asUserGroupByResult([
            { source: "explicit", _sum: { acceptedCount: 1, rejectedCount: 0 } },
        ]));
        mockProjectFindMany.mockResolvedValue(asProjectFindManyResult([
            { id: "p1", status: "active" },
            { id: "p2", status: "archived" },
        ]));
        mockUserFindMany.mockResolvedValue(asUserFindManyResult([{ id: "u1", status: "active" }]));
        mockStudyFindMany.mockResolvedValue(asStudyFindManyResult([]));
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
