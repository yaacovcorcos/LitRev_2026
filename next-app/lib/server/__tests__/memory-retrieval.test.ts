import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieveMemories } from "../memory/memory-retrieval";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        memoryRetrieval: { create: vi.fn().mockResolvedValue({}) },
    },
}));

vi.mock("@/lib/server/agent/events", () => ({
    emitEvent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/server/memory/user-memory", () => ({
    getUserMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/server/memory/project-memory", () => ({
    getProjectMemories: vi.fn().mockResolvedValue([]),
    searchProjectMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/server/memory/study-memory", () => ({
    getStudyMemories: vi.fn().mockResolvedValue([]),
    searchStudyMemories: vi.fn().mockResolvedValue([]),
}));

const { getUserMemories } = await import("@/lib/server/memory/user-memory");
const { getProjectMemories } = await import("@/lib/server/memory/project-memory");
const { getStudyMemories } = await import("@/lib/server/memory/study-memory");
const { emitEvent } = await import("@/lib/server/agent/events");

const mockGetUserMemories = vi.mocked(getUserMemories);
const mockGetProjectMemories = vi.mocked(getProjectMemories);
const mockGetStudyMemories = vi.mocked(getStudyMemories);
const mockEmitEvent = vi.mocked(emitEvent);

beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserMemories.mockResolvedValue([]);
    mockGetProjectMemories.mockResolvedValue([]);
    mockGetStudyMemories.mockResolvedValue([]);
});

describe("retrieveMemories — deterministic scope rules", () => {
    it("always includes critical ProjectMemory regardless of query", async () => {
        mockGetProjectMemories.mockImplementation(async (_pid, opts) => {
            if ((opts as any)?.importance === "critical") {
                return [
                    { id: "crit-1", type: "definition", category: "population", statement: "Adults", rationale: null, importance: "critical", tags: [], status: "active" },
                ] as any;
            }
            return [];
        });

        const result = await retrieveMemories({
            userId: "u1",
            projectId: "p1",
            query: "something totally unrelated",
        });

        expect(result.some((m) => m.id === "crit-1")).toBe(true);
    });

    it("in screening mode: always includes all criteria", async () => {
        const calls: any[] = [];
        mockGetProjectMemories.mockImplementation(async (_pid, opts) => {
            calls.push(opts);
            if ((opts as any)?.type === "criterion") {
                return [
                    { id: "cr-1", type: "criterion", category: "inclusion", statement: "RCTs only", rationale: null, importance: "normal", tags: [], status: "active" },
                    { id: "cr-2", type: "criterion", category: "exclusion", statement: "No animal studies", rationale: null, importance: "normal", tags: [], status: "active" },
                ] as any;
            }
            return [];
        });

        const result = await retrieveMemories({
            userId: "u1",
            projectId: "p1",
            agentMode: "screening",
        });

        expect(result.some((m) => m.id === "cr-1")).toBe(true);
        expect(result.some((m) => m.id === "cr-2")).toBe(true);
    });

    it("in drafting mode with citedStudyIds: includes StudyMemories", async () => {
        mockGetStudyMemories.mockResolvedValue([
            { id: "sm-1", type: "summary", category: null, content: "Study findings...", source: "ai_generated", confidence: 0.9, tags: [], status: "active" },
        ] as any);

        const result = await retrieveMemories({
            userId: "u1",
            projectId: "p1",
            agentMode: "drafting",
            citedStudyIds: ["study-A"],
        });

        expect(result.some((m) => m.id === "sm-1")).toBe(true);
        expect(mockGetStudyMemories).toHaveBeenCalledWith("study-A", { status: "active" });
    });

    it("in qa mode: includes exclusion decisions", async () => {
        mockGetProjectMemories.mockImplementation(async (_pid, opts) => {
            if ((opts as any)?.type === "decision" && (opts as any)?.category === "exclusion") {
                return [
                    { id: "exc-1", type: "decision", category: "exclusion", statement: 'Excluded "Study X"', rationale: "Wrong population", importance: "normal", tags: [], status: "active" },
                ] as any;
            }
            return [];
        });

        const result = await retrieveMemories({
            userId: "u1",
            projectId: "p1",
            agentMode: "qa",
        });

        expect(result.some((m) => m.id === "exc-1")).toBe(true);
    });

    it("always includes active UserMemory preferences", async () => {
        mockGetUserMemories.mockResolvedValue([
            { id: "um-1", type: "preference", key: "style", value: "APA format", rationale: null, tags: [], status: "active" },
        ] as any);

        const result = await retrieveMemories({ userId: "u1" });

        expect(result.some((m) => m.id === "um-1")).toBe(true);
        expect(result.find((m) => m.id === "um-1")?.content).toContain("style: APA format");
    });

    it("token budget trimming cuts lowest-relevance memories", async () => {
        // Create many user memories that exceed budget
        const manyPrefs = Array.from({ length: 20 }, (_, i) => ({
            id: `um-${i}`,
            type: "preference",
            key: `key-${i}`,
            value: "x".repeat(400), // ~100 tokens each → 20 × 100 = 2000 tokens
            rationale: null,
            tags: [],
            status: "active",
        }));
        mockGetUserMemories.mockResolvedValue(manyPrefs as any);

        const result = await retrieveMemories(
            { userId: "u1" },
            { memoryBudgetTokens: 500 }, // Only room for ~5
        );

        expect(result.length).toBeLessThan(20);
        expect(result.length).toBeGreaterThan(0);
    });

    it("context_assembly event emitted when runId provided", async () => {
        mockGetUserMemories.mockResolvedValue([
            { id: "um-1", type: "preference", key: "k", value: "v", rationale: null, tags: [], status: "active" },
        ] as any);

        await retrieveMemories({
            userId: "u1",
            runId: "run-123",
        });

        expect(mockEmitEvent).toHaveBeenCalledWith(
            "run-123",
            "context_assembly",
            expect.objectContaining({
                deterministicCount: expect.any(Number),
                keywordCount: expect.any(Number),
                finalCount: expect.any(Number),
                budget: 2000,
            }),
        );
    });

    it("does not emit context_assembly when runId is not provided", async () => {
        mockGetUserMemories.mockResolvedValue([
            { id: "um-1", type: "preference", key: "k", value: "v", rationale: null, tags: [], status: "active" },
        ] as any);

        await retrieveMemories({ userId: "u1" });

        expect(mockEmitEvent).not.toHaveBeenCalled();
    });

    it("empty project returns only user preferences", async () => {
        mockGetUserMemories.mockResolvedValue([
            { id: "um-1", type: "preference", key: "style", value: "formal", rationale: null, tags: [], status: "active" },
        ] as any);

        const result = await retrieveMemories({ userId: "u1" });

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("user");
    });

    it("deterministic memories appear before keyword memories", async () => {
        // Critical project memory (deterministic)
        mockGetProjectMemories.mockImplementation(async (_pid, opts) => {
            if ((opts as any)?.importance === "critical") {
                return [{ id: "crit-1", type: "definition", statement: "Critical info", rationale: null, importance: "critical", tags: [], status: "active", category: null }] as any;
            }
            if ((opts as any)?.status === "active") {
                return [
                    { id: "crit-1", type: "definition", statement: "Critical info", rationale: null, importance: "critical", tags: [], status: "active", category: null },
                    { id: "norm-1", type: "goal", statement: "Normal goal", rationale: null, importance: "normal", tags: [], status: "active", category: null },
                ] as any;
            }
            return [];
        });

        const result = await retrieveMemories({
            userId: "u1",
            projectId: "p1",
            query: "Critical info",
        });

        // Critical memory should be first (deterministic phase)
        const critIndex = result.findIndex((m) => m.id === "crit-1");
        expect(critIndex).toBe(0);
    });
});
