import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetMemoryTool } from "@/lib/server/ai/tools/forget-memory";
import { inspectMemoryTool } from "@/lib/server/ai/tools/inspect-memory";

vi.mock("@/lib/server/memory/user-memory", () => ({
    getUserMemories: vi.fn(),
}));

vi.mock("@/lib/server/memory/project-memory", () => ({
    getProjectMemories: vi.fn(),
}));

vi.mock("@/lib/server/memory/study-memory", () => ({
    getStudyMemoriesForProject: vi.fn(),
    getProjectStudyMemories: vi.fn(),
}));

const { getUserMemories } = await import("@/lib/server/memory/user-memory");
const { getProjectMemories } = await import("@/lib/server/memory/project-memory");
const { getStudyMemoriesForProject, getProjectStudyMemories } = await import("@/lib/server/memory/study-memory");

type UserMemoriesResult = Awaited<ReturnType<typeof getUserMemories>>;
type ProjectMemoriesResult = Awaited<ReturnType<typeof getProjectMemories>>;
type StudyMemoriesResult = Awaited<ReturnType<typeof getStudyMemoriesForProject>>;
type ProjectStudyMemoriesResult = Awaited<ReturnType<typeof getProjectStudyMemories>>;

const mockGetUserMemories = vi.mocked(getUserMemories);
const mockGetProjectMemories = vi.mocked(getProjectMemories);
const mockGetStudyMemories = vi.mocked(getStudyMemoriesForProject);
const mockGetProjectStudyMemories = vi.mocked(getProjectStudyMemories);

function asUserMemoriesResult(rows: unknown): UserMemoriesResult {
    return rows as UserMemoriesResult;
}

function asProjectMemoriesResult(rows: unknown): ProjectMemoriesResult {
    return rows as ProjectMemoriesResult;
}

function asStudyMemoriesResult(rows: unknown): StudyMemoriesResult {
    return rows as StudyMemoriesResult;
}

function asProjectStudyMemoriesResult(rows: unknown): ProjectStudyMemoriesResult {
    return rows as ProjectStudyMemoriesResult;
}

describe("memory control tools", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUserMemories.mockResolvedValue([]);
        mockGetProjectMemories.mockResolvedValue([]);
        mockGetStudyMemories.mockResolvedValue([]);
        mockGetProjectStudyMemories.mockResolvedValue(asProjectStudyMemoriesResult([]));
    });

    it("forget_memory returns archive proposal for user memory key", async () => {
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult([
            {
                id: "u1",
                userId: "user-1",
                key: "citation_format",
                value: "APA 7th",
                type: "preference",
                status: "active",
                source: "explicit",
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
                embeddingStatus: "pending",
                lastUsedAt: null,
                tags: [],
                rationale: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                archivedAt: null,
            },
        ]));

        const result = await forgetMemoryTool.execute(
            { memoryType: "user", key: "citation format" },
            { userId: "user-1" },
        );

        expect(result.error).toBeUndefined();
        expect(result.result).toEqual({
            memoryType: "user",
            key: "citation_format",
            mode: "archive",
            reason: undefined,
            matches: [{ id: "u1", label: "citation_format", value: "APA 7th" }],
        });
    });

    it("forget_memory errors when no matching project memory exists", async () => {
        const result = await forgetMemoryTool.execute(
            { memoryType: "project", key: "search_scope" },
            { projectId: "proj-1" },
        );

        expect(result.result).toBeNull();
        expect(result.error).toContain("No active project memory found");
    });

    it("inspect_memory lists active user/project/study memories", async () => {
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult([
            {
                id: "u1",
                key: "citation_format",
                value: "APA 7th",
                type: "preference",
                tags: [],
                rationale: null,
            },
        ]));
        mockGetProjectMemories.mockResolvedValue(asProjectMemoriesResult([
            {
                id: "p1",
                statement: "Exclude case studies",
                type: "decision",
                tags: ["memory-key:exclusion_rule"],
            },
        ]));
        mockGetStudyMemories.mockResolvedValue(asStudyMemoriesResult([
            {
                id: "s1",
                type: "summary",
                content: "This trial showed improved outcomes",
            },
        ]));

        const result = await inspectMemoryTool.execute(
            { memoryType: "all", limit: 10 },
            { userId: "user-1", projectId: "proj-1", studyId: "study-1" },
        );

        expect(result.error).toBeUndefined();
        expect((result.result as { memories: unknown[] }).memories).toHaveLength(3);
    });
});
