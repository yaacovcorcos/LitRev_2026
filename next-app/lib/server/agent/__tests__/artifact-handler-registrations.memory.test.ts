import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactType } from "@/types/artifacts";
import type { ApplyFunction, RestoreFunction, SnapshotReader } from "@/lib/server/agent/artifact-execution";
import { registerArtifactHandlers } from "@/lib/server/agent/artifact-handler-registrations";

function buildApplyFunction(type: "memory_forget_proposal" | "memory_proposal" = "memory_forget_proposal") {
    const applyFunctions = new Map<ArtifactType, ApplyFunction>();
    const snapshotReaders = new Map<ArtifactType, SnapshotReader>();
    const restoreFunctions = new Map<ArtifactType, RestoreFunction>();
    registerArtifactHandlers({ applyFunctions, snapshotReaders, restoreFunctions });
    const fn = applyFunctions.get(type);
    if (!fn) throw new Error(`${type} handler missing`);
    return fn;
}

describe("memory forget proposal artifact handler", () => {
    const userFindMany = vi.fn();
    const userUpdateMany = vi.fn();
    const projectFindMany = vi.fn();
    const projectUpdateMany = vi.fn();
    const embeddingDeleteMany = vi.fn();
    const executeRaw = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        userFindMany.mockResolvedValue([{ id: "user-owned" }]);
        userUpdateMany.mockResolvedValue({ count: 1 });
        projectFindMany.mockResolvedValue([{ id: "project-owned" }]);
        projectUpdateMany.mockResolvedValue({ count: 1 });
        embeddingDeleteMany.mockResolvedValue({ count: 1 });
        executeRaw.mockResolvedValue(1);
    });

    it("archives and counts only scoped active user-memory matches", async () => {
        const apply = buildApplyFunction();
        await apply({
            db: {
                userMemory: { findMany: userFindMany, updateMany: userUpdateMany },
                projectMemory: { findMany: projectFindMany, updateMany: projectUpdateMany },
                memoryEmbedding: { deleteMany: embeddingDeleteMany },
                $executeRaw: executeRaw,
            },
            projectId: "proj-1",
            ownerId: "user-1",
            workspaceId: "ws-1",
            artifactUserId: "user-1",
            effectiveActorUserId: "user-1",
            executionSource: "manual_review",
        } as never, {
            id: "artifact-1",
            payload: {
                memoryType: "user",
                key: "citation_format",
                mode: "archive",
                matches: [
                    { id: "user-owned", label: "citation_format", value: "APA" },
                    { id: "foreign", label: "citation_format", value: "MLA" },
                ],
            },
            conversationId: null,
        } as never);

        expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: { in: ["user-owned", "foreign"] },
                userId: "user-1",
                status: "active",
            }),
        }));
        expect(userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: { in: ["user-owned"] } }),
        }));
        expect(embeddingDeleteMany).toHaveBeenCalledWith({
            where: { memoryType: "user", memoryId: { in: ["user-owned"] } },
        });
    });

    it("archives and counts only scoped active project-memory matches", async () => {
        const apply = buildApplyFunction();
        await apply({
            db: {
                userMemory: { findMany: userFindMany, updateMany: userUpdateMany },
                projectMemory: { findMany: projectFindMany, updateMany: projectUpdateMany },
                memoryEmbedding: { deleteMany: embeddingDeleteMany },
                $executeRaw: executeRaw,
            },
            projectId: "proj-1",
            ownerId: "user-1",
            workspaceId: "ws-1",
            artifactUserId: "user-1",
            effectiveActorUserId: "user-1",
            executionSource: "manual_review",
        } as never, {
            id: "artifact-1",
            payload: {
                memoryType: "project",
                key: "screening_rule",
                mode: "archive",
                matches: [
                    { id: "project-owned", label: "screening_rule", value: "Exclude case studies" },
                    { id: "other-project", label: "screening_rule", value: "Exclude RCTs" },
                ],
            },
            conversationId: null,
        } as never);

        expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: { in: ["project-owned", "other-project"] },
                projectId: "proj-1",
                status: "active",
            }),
        }));
        expect(projectUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: { in: ["project-owned"] } }),
        }));
        expect(embeddingDeleteMany).toHaveBeenCalledWith({
            where: { memoryType: "project", memoryId: { in: ["project-owned"] } },
        });
    });
});

describe("memory proposal artifact handler", () => {
    it("preserves reviewed project-memory type, category, polarity, and confidence", async () => {
        const projectCreate = vi.fn().mockResolvedValue({ id: "pm-1" });
        const executeRaw = vi.fn().mockResolvedValue(1);
        const apply = buildApplyFunction("memory_proposal");

        await apply({
            db: {
                projectMemory: {
                    create: projectCreate,
                },
                $executeRaw: executeRaw,
            },
            projectId: "proj-1",
            ownerId: "user-1",
            workspaceId: "ws-1",
            artifactUserId: "user-1",
            effectiveActorUserId: "user-1",
            executionSource: "manual_review",
        } as never, {
            id: "artifact-1",
            payload: {
                memoryType: "project",
                value: "Primary outcome is mortality",
                projectMemoryType: "definition",
                projectMemoryCategory: "outcome",
                polarity: "neutral",
                confidence: 0.55,
            },
            conversationId: "conv-1",
        } as never);

        expect(projectCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                projectId: "proj-1",
                type: "definition",
                category: "outcome",
                statement: "Primary outcome is mortality",
                source: "artifact_accept",
                authority: "confirmed",
                polarity: "neutral",
                sourceRefType: "conversation",
                sourceRefId: "conv-1",
                confidence: 0.55,
                embeddingStatus: "pending",
            }),
        });
        expect(executeRaw).toHaveBeenCalled();
    });
});
