import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
    retrieveMemories,
    markMemoriesUsedInAnswer,
    formatMemoriesForContext,
    hybridFuseScore,
    temporalDecayMultiplier,
    applyTemporalDecayScore,
    rerankWithMMR,
} from "../memory/memory-retrieval";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $executeRaw: vi.fn().mockResolvedValue(1),
        memoryRetrieval: { create: vi.fn().mockResolvedValue({}) },
        memoryRetrievalItem: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    },
}));

vi.mock("@/lib/server/agent/run-event-recorder", () => ({
    recordRunEvent: vi.fn().mockResolvedValue({ persisted: true, degraded: false }),
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
    getStudyMemoriesForProject: vi.fn().mockResolvedValue([]),
    searchStudyMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/server/memory/semantic-memory", () => ({
    searchSemanticMemories: vi.fn().mockResolvedValue([]),
}));

const { getUserMemories } = await import("@/lib/server/memory/user-memory");
const { getProjectMemories, searchProjectMemories } = await import("@/lib/server/memory/project-memory");
const { getStudyMemoriesForProject, searchStudyMemories } = await import("@/lib/server/memory/study-memory");
const { searchSemanticMemories } = await import("@/lib/server/memory/semantic-memory");
const { recordRunEvent } = await import("@/lib/server/agent/run-event-recorder");
const { prisma } = await import("@/lib/server/prisma");

type UserMemoriesResult = Awaited<ReturnType<typeof getUserMemories>>;
type ProjectMemoriesResult = Awaited<ReturnType<typeof getProjectMemories>>;
type ProjectMemorySearchResult = Awaited<ReturnType<typeof searchProjectMemories>>;
type ScopedStudyMemoriesResult = Awaited<ReturnType<typeof getStudyMemoriesForProject>>;
type StudyMemorySearchResult = Awaited<ReturnType<typeof searchStudyMemories>>;
type SemanticSearchResult = Awaited<ReturnType<typeof searchSemanticMemories>>;
type ProjectMemoryOptions = Parameters<typeof getProjectMemories>[1];
type MemoryRetrievalCreateArgs = Parameters<typeof prisma.memoryRetrieval.create>[0];

const mockGetUserMemories = vi.mocked(getUserMemories);
const mockGetProjectMemories = vi.mocked(getProjectMemories);
const mockSearchProjectMemories = vi.mocked(searchProjectMemories);
const mockGetStudyMemoriesForProject = vi.mocked(getStudyMemoriesForProject);
const mockSearchStudyMemories = vi.mocked(searchStudyMemories);
const mockSearchSemanticMemories = vi.mocked(searchSemanticMemories);
const mockRecordRunEvent = vi.mocked(recordRunEvent);
const mockMemoryRetrievalCreate = vi.mocked(prisma.memoryRetrieval.create);
const mockMemoryRetrievalItemUpdateMany = vi.mocked(prisma.memoryRetrievalItem.updateMany);
const mockExecuteRaw = vi.mocked(prisma.$executeRaw);
const originalAdvancedRerankFlag = process.env.ENABLE_MEMORY_ADVANCED_RERANKING;

function asUserMemoriesResult(rows: unknown): UserMemoriesResult {
    return rows as UserMemoriesResult;
}

function asProjectMemoriesResult(rows: unknown): ProjectMemoriesResult {
    return rows as ProjectMemoriesResult;
}

function asProjectMemorySearchResult(rows: unknown): ProjectMemorySearchResult {
    return rows as ProjectMemorySearchResult;
}

function asScopedStudyMemoriesResult(rows: unknown): ScopedStudyMemoriesResult {
    return rows as ScopedStudyMemoriesResult;
}

function asStudyMemorySearchResult(rows: unknown): StudyMemorySearchResult {
    return rows as StudyMemorySearchResult;
}

function asSemanticSearchResult(rows: unknown): SemanticSearchResult {
    return rows as SemanticSearchResult;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserMemories.mockResolvedValue([]);
    mockGetProjectMemories.mockResolvedValue([]);
    mockSearchProjectMemories.mockResolvedValue([]);
    mockGetStudyMemoriesForProject.mockResolvedValue([]);
    mockSearchStudyMemories.mockResolvedValue([]);
    mockSearchSemanticMemories.mockResolvedValue([]);
    mockExecuteRaw.mockResolvedValue(1);
    delete process.env.ENABLE_MEMORY_ADVANCED_RERANKING;
});

afterAll(() => {
    if (originalAdvancedRerankFlag !== undefined) {
        process.env.ENABLE_MEMORY_ADVANCED_RERANKING = originalAdvancedRerankFlag;
    } else {
        delete process.env.ENABLE_MEMORY_ADVANCED_RERANKING;
    }
});

describe("formatMemoriesForContext", () => {
    it("carries source and authority labels into prompt context", () => {
        const context = formatMemoriesForContext([
            {
                id: "pm-1",
                type: "project",
                memoryType: "criterion",
                content: "[criterion - inclusion] Include adult RCTs",
                relevance: 1,
                source: "protocol_sync",
                authority: "canonical",
                polarity: "affirming",
            },
            {
                id: "sm-1",
                type: "study",
                memoryType: "finding",
                content: "[finding - results] Small improvement in pain scores",
                relevance: 0.8,
                source: "deep_analysis",
                authority: "inferred",
                polarity: "affirming",
            },
        ]);

        expect(context).toContain("[Canonical / Protocol sync] [criterion - inclusion] Include adult RCTs");
        expect(context).toContain("[Inferred / Deep analysis] [finding - results] Small improvement in pain scores");
        expect(context).toContain("Treat Canonical/Confirmed items as stronger than Inferred/Proposed items");
    });

    it("marks rejecting memories as negative context", () => {
        const context = formatMemoriesForContext([
            {
                id: "pm-2",
                type: "project",
                memoryType: "decision",
                content: "[decision - exclusion] Excluded grey literature",
                relevance: 1,
                source: "artifact_accept",
                authority: "confirmed",
                polarity: "rejecting",
            },
        ]);

        expect(context).toContain("[Confirmed / Accepted artifact / Rejecting] [decision - exclusion] Excluded grey literature");
        expect(context).toContain("Rejecting items as ruled-out or negative memory");
    });

    it("does not invent provenance labels for legacy rows without metadata", () => {
        const context = formatMemoriesForContext([
            {
                id: "um-1",
                type: "user",
                memoryType: "preference",
                content: "style: concise",
                relevance: 1,
            },
        ]);

        expect(context).toContain("- style: concise");
        expect(context).not.toContain("[Confirmed]");
    });
});

describe("retrieveMemories — deterministic scope rules", () => {
    it("always includes critical ProjectMemory regardless of query", async () => {
        mockGetProjectMemories.mockImplementation(async (_pid, opts) => {
            if (opts?.importance === "critical") {
                return asProjectMemoriesResult([
                    { id: "crit-1", type: "definition", category: "population", statement: "Adults", rationale: null, importance: "critical", tags: [], status: "active" },
                ]);
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
        mockGetProjectMemories.mockImplementation(async (_pid, opts: ProjectMemoryOptions) => {
            if (opts?.type === "criterion") {
                return asProjectMemoriesResult([
                    { id: "cr-1", type: "criterion", category: "inclusion", statement: "RCTs only", rationale: null, importance: "normal", tags: [], status: "active" },
                    { id: "cr-2", type: "criterion", category: "exclusion", statement: "No animal studies", rationale: null, importance: "normal", tags: [], status: "active" },
                ]);
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
        mockGetStudyMemoriesForProject.mockResolvedValue(asScopedStudyMemoriesResult([
            { id: "sm-1", studyId: "study-A", projectId: "p1", type: "summary", category: null, content: "Study findings...", source: "ai_generated", confidence: 0.9, tags: [], status: "active" },
        ]));

        const result = await retrieveMemories({
            userId: "u1",
            projectId: "p1",
            agentMode: "drafting",
            citedStudyIds: ["study-A"],
        });

        expect(result.some((m) => m.id === "sm-1")).toBe(true);
        expect(mockGetStudyMemoriesForProject).toHaveBeenCalledWith("p1", "study-A", { status: "active" });
    });

    it("rejects cited study retrieval without a project scope", async () => {
        await expect(retrieveMemories({
            userId: "u1",
            agentMode: "drafting",
            citedStudyIds: ["study-A"],
        })).rejects.toThrow("Project scope is required");
    });

    it("in qa mode: includes exclusion decisions", async () => {
        mockGetProjectMemories.mockImplementation(async (_pid, opts) => {
            if (opts?.type === "decision" && opts.category === "exclusion") {
                return asProjectMemoriesResult([
                    { id: "exc-1", type: "decision", category: "exclusion", statement: 'Excluded "Study X"', rationale: "Wrong population", importance: "normal", tags: [], status: "active" },
                ]);
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
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult([
            { id: "um-1", type: "preference", key: "style", value: "APA format", rationale: null, tags: [], status: "active" },
        ]));

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
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult(manyPrefs));

        const result = await retrieveMemories(
            { userId: "u1" },
            { memoryBudgetTokens: 500 }, // Only room for ~5
        );

        expect(result.length).toBeLessThan(20);
        expect(result.length).toBeGreaterThan(0);
    });

    it("context_assembly event emitted when runId provided", async () => {
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult([
            { id: "um-1", type: "preference", key: "k", value: "v", rationale: null, tags: [], status: "active" },
        ]));

        await retrieveMemories({
            userId: "u1",
            runId: "run-123",
        });

        expect(mockRecordRunEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: "run-123",
                type: "context_assembly",
                payload: expect.objectContaining({
                    deterministicCount: expect.any(Number),
                    keywordCount: expect.any(Number),
                    finalCount: expect.any(Number),
                    budget: 2000,
                }),
                logContext: "memory_context_assembly",
            }),
        );
    });

    it("does not emit context_assembly when runId is not provided", async () => {
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult([
            { id: "um-1", type: "preference", key: "k", value: "v", rationale: null, tags: [], status: "active" },
        ]));

        await retrieveMemories({ userId: "u1" });

        expect(mockRecordRunEvent).not.toHaveBeenCalled();
    });

    it("does not fail retrieval when audit logging fails", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult([
            { id: "um-1", type: "preference", key: "k", value: "v", rationale: null, tags: [], status: "active" },
        ]));
        mockMemoryRetrievalCreate.mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"));

        const result = await retrieveMemories({ userId: "u1" });

        expect(result).toHaveLength(1);
        expect(mockMemoryRetrievalCreate).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            "[memory] retrieval audit logging failed",
            expect.objectContaining({
                userId: "u1",
                error: "Connection terminated due to connection timeout",
            }),
        );

        warnSpy.mockRestore();
    });

    it("empty project returns only user preferences", async () => {
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult([
            { id: "um-1", type: "preference", key: "style", value: "formal", rationale: null, tags: [], status: "active" },
        ]));

        const result = await retrieveMemories({ userId: "u1" });

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("user");
    });

    it("deterministic memories appear before keyword memories", async () => {
        // Critical project memory (deterministic)
        mockGetProjectMemories.mockImplementation(async (_pid, opts) => {
            if (opts?.importance === "critical") {
                return asProjectMemoriesResult([{ id: "crit-1", type: "definition", statement: "Critical info", rationale: null, importance: "critical", tags: [], status: "active", category: null }]);
            }
            if (opts?.status === "active") {
                return asProjectMemoriesResult([
                    { id: "crit-1", type: "definition", statement: "Critical info", rationale: null, importance: "critical", tags: [], status: "active", category: null },
                    { id: "norm-1", type: "goal", statement: "Normal goal", rationale: null, importance: "normal", tags: [], status: "active", category: null },
                ]);
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

    it("keyword ranking boosts exact identifier matches", async () => {
        mockSearchProjectMemories.mockResolvedValue(asProjectMemorySearchResult([
            {
                id: "pm-doi",
                projectId: "p1",
                type: "decision",
                category: "outcome",
                statement: "Key source DOI: 10.1000/xyz123",
                rationale: null,
                context: null,
                status: "active",
                version: 1,
                supersededBy: null,
                tags: ["source"],
                importance: "normal",
                createdAt: new Date(),
                updatedAt: new Date(),
                archivedAt: null,
            },
            {
                id: "pm-generic",
                projectId: "p1",
                type: "decision",
                category: "outcome",
                statement: "Some general blood pressure outcome rule",
                rationale: null,
                context: null,
                status: "active",
                version: 1,
                supersededBy: null,
                tags: ["source"],
                importance: "normal",
                createdAt: new Date(),
                updatedAt: new Date(),
                archivedAt: null,
            },
        ]));

        const result = await retrieveMemories(
            {
                userId: "u1",
                projectId: "p1",
                query: "10.1000/xyz123 blood pressure",
            },
            { includeUser: false, includeStudy: false, maxMemories: 5 },
        );

        const doiIndex = result.findIndex((m) => m.id === "pm-doi");
        const genericIndex = result.findIndex((m) => m.id === "pm-generic");
        expect(doiIndex).toBeGreaterThanOrEqual(0);
        expect(genericIndex).toBeGreaterThanOrEqual(0);
        expect(doiIndex).toBeLessThan(genericIndex);
    });

    it("searches scoped study memories by query when project is present", async () => {
        mockSearchStudyMemories.mockResolvedValue(asStudyMemorySearchResult([
            {
                id: "sm-query",
                studyId: "study-1",
                projectId: "p1",
                type: "finding",
                category: "results",
                content: "Smith 2023 reports reduced anxiety in RCT cohort",
                source: "extracted",
                confidence: 0.92,
                status: "active",
                tags: ["smith", "2023"],
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ]));

        const result = await retrieveMemories(
            {
                userId: "u1",
                projectId: "p1",
                query: "smith 2023 anxiety",
            },
            {
                includeUser: false,
                includeProject: false,
                includeStudy: true,
            },
        );

        expect(mockSearchStudyMemories).toHaveBeenCalledWith("p1", "smith 2023 anxiety", undefined);
        expect(result.some((m) => m.id === "sm-query")).toBe(true);
    });

    it("applies utility weighting so criteria/decisions rank above equally matched generic memories", async () => {
        mockSearchProjectMemories.mockResolvedValue(asProjectMemorySearchResult([
            {
                id: "pm-criterion",
                projectId: "p1",
                type: "criterion",
                category: "inclusion",
                statement: "Include randomized controlled trials with adults",
                rationale: null,
                context: null,
                status: "active",
                version: 1,
                supersededBy: null,
                tags: [],
                importance: "normal",
                createdAt: new Date(),
                updatedAt: new Date(),
                archivedAt: null,
            },
            {
                id: "pm-definition",
                projectId: "p1",
                type: "definition",
                category: "population",
                statement: "Adults are participants over age 18",
                rationale: null,
                context: null,
                status: "active",
                version: 1,
                supersededBy: null,
                tags: [],
                importance: "normal",
                createdAt: new Date(),
                updatedAt: new Date(),
                archivedAt: null,
            },
        ]));

        const result = await retrieveMemories(
            {
                userId: "u1",
                projectId: "p1",
                query: "adults",
            },
            {
                includeUser: false,
                includeStudy: false,
                maxMemories: 5,
            },
        );

        const criterionIndex = result.findIndex((m) => m.id === "pm-criterion");
        const definitionIndex = result.findIndex((m) => m.id === "pm-definition");
        expect(criterionIndex).toBeGreaterThanOrEqual(0);
        expect(definitionIndex).toBeGreaterThanOrEqual(0);
        expect(criterionIndex).toBeLessThan(definitionIndex);
    });

    it("logs retrieval with conversationId when provided", async () => {
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult([
            { id: "um-1", type: "preference", key: "style", value: "formal", rationale: null, tags: [], status: "active", source: "explicit_user", authority: "confirmed" },
        ]));

        await retrieveMemories({
            userId: "u1",
            projectId: "p1",
            conversationId: "conv-123",
            query: "style",
        });

        expect(mockMemoryRetrievalCreate).toHaveBeenCalled();
        const firstCall = mockMemoryRetrievalCreate.mock.calls[0]?.[0] as MemoryRetrievalCreateArgs | undefined;
        expect(firstCall?.data?.conversationId).toBe("conv-123");
        expect(firstCall?.data).toEqual(expect.objectContaining({
            items: {
                create: [expect.objectContaining({
                    memoryId: "um-1",
                    memoryType: "user",
                    source: "explicit_user",
                    authority: "confirmed",
                    tokenEstimate: expect.any(Number),
                })],
            },
        }));
        expect(mockExecuteRaw).toHaveBeenCalled();
    });

    it("marks only the concrete retrieval item rows used by the answer", async () => {
        mockGetUserMemories.mockResolvedValue(asUserMemoriesResult([
            {
                id: "um-1",
                type: "preference",
                key: "style",
                value: "formal writing",
                rationale: null,
                tags: [],
                status: "active",
                source: "explicit_user",
                authority: "confirmed",
            },
        ]));
        mockMemoryRetrievalCreate.mockResolvedValueOnce({
            id: "ret-user",
            items: [{
                id: "ret-item-1",
                retrievalId: "ret-user",
                memoryType: "user",
                memoryId: "um-1",
            }],
        } as never);

        const result = await retrieveMemories({ userId: "u1", query: "style" });

        expect(result[0].retrievalItemId).toBe("ret-item-1");

        await markMemoriesUsedInAnswer(result, "Please use the formal style in this answer.");

        expect(mockMemoryRetrievalItemUpdateMany).toHaveBeenCalledWith({
            where: { id: { in: ["ret-item-1"] } },
            data: { usedInAnswer: true },
        });
        expect(mockMemoryRetrievalItemUpdateMany).not.toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ memoryId: expect.anything() }),
        }));
    });

    it("merges semantic layer results into retrieval output", async () => {
        mockSearchSemanticMemories.mockResolvedValue(asSemanticSearchResult([
            {
                id: "pm-semantic",
                type: "project",
                memoryType: "definition",
                content: "[definition - outcome] Symptom burden score is primary outcome",
                relevance: 0.91,
                tags: ["outcome"],
            },
        ]));

        const result = await retrieveMemories(
            {
                userId: "u1",
                projectId: "p1",
                query: "symptom burden endpoint",
            },
            {
                includeUser: false,
                includeProject: true,
                includeStudy: false,
            },
        );

        expect(mockSearchSemanticMemories).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "u1",
                projectId: "p1",
                query: "symptom burden endpoint",
            }),
            expect.objectContaining({
                minRelevance: 0.3,
                includeProject: true,
            }),
            new Set(),
        );
        expect(result.some((memory) => memory.id === "pm-semantic")).toBe(true);
    });

    it("allows lexical and semantic layers to overlap before fusion", async () => {
        mockSearchProjectMemories.mockResolvedValue(asProjectMemorySearchResult([
            {
                id: "pm-overlap",
                projectId: "p1",
                type: "definition",
                category: "outcome",
                statement: "Symptom burden score is primary outcome",
                rationale: null,
                context: null,
                status: "active",
                version: 1,
                supersededBy: null,
                tags: [],
                importance: "normal",
                createdAt: new Date(),
                updatedAt: new Date(),
                archivedAt: null,
            },
        ]));
        mockSearchSemanticMemories.mockResolvedValue(asSemanticSearchResult([
            {
                id: "pm-overlap",
                type: "project",
                memoryType: "definition",
                content: "[definition - outcome] Symptom burden score is primary outcome",
                relevance: 0.9,
                tags: [],
            },
        ]));

        const result = await retrieveMemories(
            { userId: "u1", projectId: "p1", query: "symptom burden endpoint" },
            { includeUser: false, includeProject: true, includeStudy: false },
        );

        expect(mockSearchSemanticMemories).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            new Set(),
        );
        expect(result.filter((memory) => memory.id === "pm-overlap")).toHaveLength(1);
        expect(result[0].semanticScore).toBeGreaterThan(0);
        expect(result[0].lexicalScore).toBeGreaterThan(0);
    });
});

describe("memory retrieval reranking primitives", () => {
    it("computes hybrid fusion using weighted lexical + semantic scores", () => {
        const score = hybridFuseScore(0.2, 0.8);
        expect(score).toBeCloseTo((0.2 * 0.3) + (0.8 * 0.7), 6);
    });

    it("applies temporal decay with half-life behavior", () => {
        const now = Date.UTC(2026, 1, 25); // 2026-02-25
        const thirtyDaysAgo = new Date(now - (30 * 24 * 60 * 60 * 1000)).toISOString();
        const multiplier = temporalDecayMultiplier(thirtyDaysAgo, now, 30);
        expect(multiplier).toBeCloseTo(0.5, 2);
    });

    it("keeps score unchanged when updatedAt is missing", () => {
        expect(applyTemporalDecayScore(0.72, undefined, Date.now(), 30)).toBeCloseTo(0.72, 6);
    });

    it("MMR reranking favors diversity after selecting top relevance", () => {
        const ranked = rerankWithMMR(
            [
                {
                    id: "a",
                    type: "project",
                    memoryType: "decision",
                    content: "blood pressure trial adults antihypertensive treatment",
                    relevance: 0.95,
                },
                {
                    id: "b",
                    type: "project",
                    memoryType: "decision",
                    content: "blood pressure trial adults antihypertensive dosing response",
                    relevance: 0.92,
                },
                {
                    id: "c",
                    type: "project",
                    memoryType: "definition",
                    content: "risk of bias assessment and evidence quality grading",
                    relevance: 0.82,
                },
            ],
            2,
            0.7,
        );

        expect(ranked.map((memory) => memory.id)).toEqual(["a", "c"]);
    });

    it("flag off keeps default rank ordering with narrow candidate pool", async () => {
        process.env.ENABLE_MEMORY_ADVANCED_RERANKING = "0";
        mockSearchSemanticMemories.mockResolvedValue(asSemanticSearchResult([
            {
                id: "sem-1",
                type: "project",
                memoryType: "definition",
                content: "alpha blood pressure antihypertensive adults",
                relevance: 0.95,
                updatedAt: new Date("2026-02-20T00:00:00.000Z").toISOString(),
            },
            {
                id: "sem-2",
                type: "project",
                memoryType: "definition",
                content: "alpha blood pressure antihypertensive dosage",
                relevance: 0.94,
                updatedAt: new Date("2026-02-20T00:00:00.000Z").toISOString(),
            },
            {
                id: "sem-3",
                type: "project",
                memoryType: "definition",
                content: "gamma risk of bias and certainty grading",
                relevance: 0.80,
                updatedAt: new Date("2026-02-20T00:00:00.000Z").toISOString(),
            },
        ]));

        const result = await retrieveMemories(
            {
                userId: "u1",
                projectId: "p1",
                query: "blood pressure",
            },
            { includeUser: false, includeProject: true, includeStudy: false, maxMemories: 2 },
        );

        expect(result.map((memory) => memory.id)).toEqual(["sem-1", "sem-2"]);
    });

    it("flag on applies expanded candidate pool + reranking", async () => {
        process.env.ENABLE_MEMORY_ADVANCED_RERANKING = "1";
        mockSearchSemanticMemories.mockResolvedValue(asSemanticSearchResult([
            {
                id: "sem-1",
                type: "project",
                memoryType: "definition",
                content: "alpha blood pressure antihypertensive adults",
                relevance: 0.95,
                updatedAt: new Date("2026-02-20T00:00:00.000Z").toISOString(),
            },
            {
                id: "sem-2",
                type: "project",
                memoryType: "definition",
                content: "alpha blood pressure antihypertensive dosage",
                relevance: 0.94,
                updatedAt: new Date("2026-02-20T00:00:00.000Z").toISOString(),
            },
            {
                id: "sem-3",
                type: "project",
                memoryType: "definition",
                content: "gamma risk of bias and certainty grading",
                relevance: 0.80,
                updatedAt: new Date("2026-02-20T00:00:00.000Z").toISOString(),
            },
        ]));

        const result = await retrieveMemories(
            {
                userId: "u1",
                projectId: "p1",
                query: "blood pressure",
            },
            { includeUser: false, includeProject: true, includeStudy: false, maxMemories: 2 },
        );

        expect(result.map((memory) => memory.id)).toEqual(["sem-1", "sem-3"]);
    });
});
