import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    projectFindFirst: vi.fn(),
    studyFindFirst: vi.fn(),
    userMemoryFindFirst: vi.fn(),
    projectMemoryFindFirst: vi.fn(),
    studyMemoryFindFirst: vi.fn(),
    retrieveMemories: vi.fn(),
    getSemanticRolloutStatus: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        project: { findFirst: mocks.projectFindFirst },
        study: { findFirst: mocks.studyFindFirst },
        userMemory: { findFirst: mocks.userMemoryFindFirst },
        projectMemory: { findFirst: mocks.projectMemoryFindFirst },
        studyMemory: { findFirst: mocks.studyMemoryFindFirst },
    },
}));

vi.mock("@/lib/server/auth/session", () => ({
    withAuth: (handler: (ctx: { userId: string; workspaceId: string }) => Promise<unknown>) =>
        handler({ userId: "user-1", workspaceId: "ws-1" }),
}));

vi.mock("@/lib/server/memory", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("@/lib/server/memory");
    return {
        ...actual,
        retrieveMemories: mocks.retrieveMemories,
        validateSemanticRolloutStatus: mocks.getSemanticRolloutStatus,
    };
});

const { retrieveMemoriesAction, getSemanticRolloutStatusAction } = await import("@/app/actions/memory");

describe("memory actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.projectFindFirst.mockResolvedValue({ id: "proj-1" });
        mocks.studyFindFirst.mockImplementation(async ({ where }: { where: { id: string; projectId?: string } }) => ({
            projectId: where.projectId ?? "proj-1",
        }));
        mocks.retrieveMemories.mockResolvedValue([]);
        mocks.getSemanticRolloutStatus.mockResolvedValue({
            extensionInstalled: true,
            embeddingTablePresent: true,
            hnswIndexPresent: true,
            totalEmbeddings: 2,
            model: "text-embedding-3-small",
            healthy: true,
        });
    });

    it("authorizes every cited study before retrieval", async () => {
        const result = await retrieveMemoriesAction({
            userId: "ignored-client-user",
            projectId: "proj-1",
            agentMode: "drafting",
            citedStudyIds: ["study-1", "study-2"],
        });

        expect(result.success).toBe(true);
        expect(mocks.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "proj-1", ownerId: "user-1", workspaceId: "ws-1" },
        }));
        expect(mocks.studyFindFirst).toHaveBeenCalledTimes(2);
        expect(mocks.studyFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: "study-1", projectId: "proj-1" }),
        }));
        expect(mocks.retrieveMemories).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-1",
                projectId: "proj-1",
                citedStudyIds: ["study-1", "study-2"],
            }),
            undefined,
        );
    });

    it("rejects retrieval when a cited study is outside the project scope", async () => {
        mocks.studyFindFirst.mockResolvedValueOnce({ projectId: "proj-1" }).mockResolvedValueOnce(null);

        const result = await retrieveMemoriesAction({
            userId: "ignored-client-user",
            projectId: "proj-1",
            agentMode: "drafting",
            citedStudyIds: ["study-1", "foreign-study"],
        });

        expect(result.success).toBe(false);
        expect(mocks.retrieveMemories).not.toHaveBeenCalled();
    });

    it("requires project access before returning semantic rollout diagnostics", async () => {
        const result = await getSemanticRolloutStatusAction("proj-1");

        expect(result.success).toBe(true);
        expect(mocks.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "proj-1", ownerId: "user-1", workspaceId: "ws-1" },
        }));
        expect(mocks.getSemanticRolloutStatus).toHaveBeenCalled();
    });
});
