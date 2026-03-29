import { describe, expect, it, vi } from "vitest";
import { ArtifactError } from "@/lib/server/agent/artifact-errors";
import type { ArtifactExecutionArtifact } from "@/lib/server/agent/artifact-execution";
import { buildExecutionContext, executePostCommitTasks } from "@/lib/server/agent/artifact-execution";

function createArtifact(overrides: Partial<ArtifactExecutionArtifact> = {}): ArtifactExecutionArtifact {
    return {
        id: "artifact-1",
        runId: "run-1",
        projectId: "project-1",
        conversationId: "conversation-1",
        userId: "user-1",
        type: "draft_diff",
        status: "proposed",
        title: "Draft diff",
        payload: {},
        snapshot: null,
        version: 1,
        sourceEventId: null,
        applyId: null,
        appliedAt: null,
        appliedByUserId: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: new Date(),
        project: {
            ownerId: "owner-1",
            workspaceId: "workspace-1",
        },
        ...overrides,
    } as ArtifactExecutionArtifact;
}

describe("artifact-execution", () => {
    it("builds execution context and prefers the explicit actor id", () => {
        const artifact = createArtifact({ userId: "artifact-user" });
        const tx = {} as never;

        const context = buildExecutionContext(tx, artifact, "manual_review", "reviewer-1");

        expect(context).toMatchObject({
            db: tx,
            projectId: "project-1",
            ownerId: "owner-1",
            workspaceId: "workspace-1",
            artifactUserId: "artifact-user",
            effectiveActorUserId: "reviewer-1",
            executionSource: "manual_review",
        });
    });

    it("rejects artifacts that are missing project context", () => {
        const artifact = createArtifact({
            projectId: null,
            project: null as never,
        });

        expect(() => buildExecutionContext({} as never, artifact, "auto_apply")).toThrowError(ArtifactError);
        expect(() => buildExecutionContext({} as never, artifact, "auto_apply")).toThrow(
            expect.objectContaining({ errorCode: "ARTIFACT_CONTEXT_MISSING" }),
        );
    });

    it("logs post-commit failures with project context and keeps going", async () => {
        const syncProtocolToMemoryFn = vi
            .fn()
            .mockRejectedValueOnce(new Error("sync failed"))
            .mockResolvedValueOnce(undefined);
        const logServerErrorFn = vi.fn();

        await executePostCommitTasks(
            [
                { kind: "sync_protocol_to_memory", projectId: "project-a", protocolData: {} as never },
                { kind: "sync_protocol_to_memory", projectId: "project-b", protocolData: {} as never },
            ],
            { id: "artifact-1", runId: "run-1" },
            { logServerErrorFn, syncProtocolToMemoryFn },
        );

        expect(syncProtocolToMemoryFn).toHaveBeenCalledTimes(2);
        expect(logServerErrorFn).toHaveBeenCalledTimes(1);
        expect(logServerErrorFn).toHaveBeenCalledWith(
            "artifacts",
            "artifact post-commit task failed",
            expect.objectContaining({
                artifactId: "artifact-1",
                runId: "run-1",
                projectId: "project-a",
                task: "sync_protocol_to_memory",
            }),
            expect.any(Error),
        );
    });
});
