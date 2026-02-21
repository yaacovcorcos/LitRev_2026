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
    getStudyMemories: vi.fn(),
    getProjectStudyMemories: vi.fn(),
}));

const { getUserMemories } = await import("@/lib/server/memory/user-memory");
const { getProjectMemories } = await import("@/lib/server/memory/project-memory");
const { getStudyMemories, getProjectStudyMemories } = await import("@/lib/server/memory/study-memory");

const mockGetUserMemories = vi.mocked(getUserMemories);
const mockGetProjectMemories = vi.mocked(getProjectMemories);
const mockGetStudyMemories = vi.mocked(getStudyMemories);
const mockGetProjectStudyMemories = vi.mocked(getProjectStudyMemories);

describe("memory control tools", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUserMemories.mockResolvedValue([]);
        mockGetProjectMemories.mockResolvedValue([]);
        mockGetStudyMemories.mockResolvedValue([]);
        mockGetProjectStudyMemories.mockResolvedValue([]);
    });

    it("forget_memory returns archive proposal for user memory key", async () => {
        mockGetUserMemories.mockResolvedValue([
            {
                id: "u1",
                userId: "user-1",
                key: "citation_format",
                value: "APA 7th",
                type: "preference",
                status: "active",
                source: "explicit",
                confidence: 1,
                retrievalCount: 0,
                usedInAnswerCount: 0,
                acceptedCount: 0,
                rejectedCount: 0,
                contradictionCount: 0,
                pinned: false,
                tags: [],
                rationale: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                archivedAt: null,
            },
        ] as any);

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
        mockGetUserMemories.mockResolvedValue([
            {
                id: "u1",
                key: "citation_format",
                value: "APA 7th",
                type: "preference",
                tags: [],
                rationale: null,
            },
        ] as any);
        mockGetProjectMemories.mockResolvedValue([
            {
                id: "p1",
                statement: "Exclude case studies",
                type: "decision",
                tags: ["memory-key:exclusion_rule"],
            },
        ] as any);
        mockGetStudyMemories.mockResolvedValue([
            {
                id: "s1",
                type: "summary",
                content: "This trial showed improved outcomes",
            },
        ] as any);

        const result = await inspectMemoryTool.execute(
            { memoryType: "all", limit: 10 },
            { userId: "user-1", projectId: "proj-1", studyId: "study-1" },
        );

        expect(result.error).toBeUndefined();
        expect((result.result as { memories: unknown[] }).memories).toHaveLength(3);
    });
});

