import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    embeddingCreate: vi.fn(),
    queryRaw: vi.fn(),
    executeRaw: vi.fn(),
    userFindMany: vi.fn(),
    userUpdateMany: vi.fn(),
    projectFindMany: vi.fn(),
    projectUpdateMany: vi.fn(),
    studyFindMany: vi.fn(),
    studyUpdateMany: vi.fn(),
}));

vi.mock("openai", () => ({
    default: class MockOpenAI {
        embeddings = {
            create: mocks.embeddingCreate,
        };
    },
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $queryRaw: mocks.queryRaw,
        $executeRaw: mocks.executeRaw,
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
            $executeRaw: mocks.executeRaw,
            userMemory: { updateMany: mocks.userUpdateMany },
            projectMemory: { updateMany: mocks.projectUpdateMany },
            studyMemory: { updateMany: mocks.studyUpdateMany },
        }),
        userMemory: {
            findMany: mocks.userFindMany,
            updateMany: mocks.userUpdateMany,
        },
        projectMemory: {
            findMany: mocks.projectFindMany,
            updateMany: mocks.projectUpdateMany,
        },
        studyMemory: {
            findMany: mocks.studyFindMany,
            updateMany: mocks.studyUpdateMany,
        },
    },
}));

const { searchSemanticMemories, warmupSemanticEmbeddings } = await import("@/lib/server/memory/semantic-memory");

describe("semantic memory embedding lifecycle", () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalBackfill = process.env.ENABLE_MEMORY_REQUEST_EMBEDDING_BACKFILL;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = "test-key";
        delete process.env.ENABLE_MEMORY_REQUEST_EMBEDDING_BACKFILL;
        mocks.embeddingCreate.mockResolvedValue({
            data: [{ embedding: Array.from({ length: 1536 }, () => 0.01) }],
        });
        mocks.queryRaw.mockResolvedValueOnce([
            { memoryType: "project", memoryId: "pm-1", score: 0.88 },
        ]);
        mocks.projectFindMany.mockResolvedValue([
            {
                id: "pm-1",
                type: "definition",
                category: "outcome",
                statement: "Primary outcome is symptom burden",
                rationale: null,
                tags: [],
                source: "explicit_user",
                authority: "confirmed",
                polarity: "affirming",
                updatedAt: new Date("2026-05-31T00:00:00.000Z"),
            },
        ]);
        mocks.userFindMany.mockResolvedValue([]);
        mocks.studyFindMany.mockResolvedValue([]);
    });

    afterEach(() => {
        if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalApiKey;
        if (originalBackfill === undefined) delete process.env.ENABLE_MEMORY_REQUEST_EMBEDDING_BACKFILL;
        else process.env.ENABLE_MEMORY_REQUEST_EMBEDDING_BACKFILL = originalBackfill;
    });

    it("does not backfill corpus embeddings on the answer path by default", async () => {
        const result = await searchSemanticMemories(
            { userId: "user-1", projectId: "proj-1", query: "symptom burden endpoint" },
            { minRelevance: 0.3, includeUser: false, includeProject: true, includeStudy: false },
            new Set(),
        );

        expect(result).toHaveLength(1);
        expect(mocks.embeddingCreate).toHaveBeenCalledTimes(1);
        expect(mocks.executeRaw).not.toHaveBeenCalled();
        expect(mocks.projectUpdateMany).not.toHaveBeenCalled();
    });

    it("uses warmup to create or refresh corpus embeddings and mark rows ready", async () => {
        mocks.queryRaw.mockReset();
        mocks.queryRaw.mockResolvedValue([]);
        mocks.projectFindMany.mockResolvedValueOnce([
            {
                id: "pm-1",
                projectId: "proj-1",
                type: "definition",
                category: "outcome",
                statement: "Primary outcome is symptom burden",
                rationale: null,
                tags: [],
            },
        ]);
        const result = await warmupSemanticEmbeddings(
            { userId: "user-1", projectId: "proj-1" },
            { includeUser: false, includeProject: true, includeStudy: false },
        );

        expect(result.scanned).toBe(1);
        expect(result.indexed).toBe(1);
        expect(mocks.executeRaw).toHaveBeenCalled();
        expect(mocks.projectUpdateMany).toHaveBeenCalledWith({
            where: { id: "pm-1" },
            data: { embeddingStatus: "ready" },
        });
    });
});
