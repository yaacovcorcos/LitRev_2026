/**
 * Agent Server Actions
 * Client-callable actions for artifact review, undo, and autonomy config
 * (planC Phase 0.5)
 */

"use server";

import { revalidatePath } from "next/cache";
import { reviewArtifact, undoArtifact, getArtifact } from "@/lib/server/agent/artifacts";
import { getRunTimeline } from "@/lib/server/agent/events";
import { getAutonomyConfig, updateAutonomyConfig } from "@/lib/server/agent/autonomy";
import { sanitizeErrorMessage } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import type { ArtifactStatus } from "@/types/artifacts";
import type { AutonomyPreset, AutonomyLevel } from "@/types/agent";

async function assertArtifactAccess(artifactId: string, userId: string, workspaceId: string): Promise<void> {
    const artifact = await prisma.artifact.findFirst({
        where: {
            id: artifactId,
            OR: [
                { userId },
                { project: { ownerId: userId, workspaceId } },
            ],
        },
        select: { id: true },
    });
    if (!artifact) {
        throw new Error("Artifact not found or access denied");
    }
}

async function assertRunAccess(runId: string, userId: string, workspaceId: string): Promise<void> {
    const run = await prisma.agentRun.findFirst({
        where: {
            id: runId,
            OR: [
                { userId },
                { project: { ownerId: userId, workspaceId } },
            ],
        },
        select: { id: true },
    });
    if (!run) {
        throw new Error("Run not found or access denied");
    }
}

/**
 * Review an artifact (accept/reject/edit).
 * Pass `editedPayload` to update the artifact's payload before applying (edit-then-accept).
 */
export async function reviewArtifactAction(
    artifactId: string,
    status: Extract<ArtifactStatus, "accepted" | "rejected" | "edited">,
    reviewNote?: string,
    editedPayload?: Record<string, unknown>,
) {
    try {
        const result = await withAuth(async ({ userId, workspaceId }) => {
            await assertArtifactAccess(artifactId, userId, workspaceId);
            return reviewArtifact(artifactId, status, reviewNote, editedPayload);
        });

        if (status === "accepted" && result.type === "study_update") {
            const payload = (result.payload ?? {}) as { studyId?: string };
            if (result.projectId && payload.studyId) {
                revalidatePath(`/project/${result.projectId}/ledger/${payload.studyId}`);
                revalidatePath(`/project/${result.projectId}/ledger`);
            }
        }

        return { success: true, artifact: result };
    } catch (error) {
        return {
            success: false,
            error: sanitizeErrorMessage(error, "Failed to review artifact", { allowRawMessage: true }),
        };
    }
}

/**
 * Undo an applied artifact
 */
export async function undoArtifactAction(artifactId: string) {
    try {
        const result = await withAuth(async ({ userId, workspaceId }) => {
            await assertArtifactAccess(artifactId, userId, workspaceId);
            return undoArtifact(artifactId);
        });
        return { success: true, artifact: result };
    } catch (error) {
        return {
            success: false,
            error: sanitizeErrorMessage(error, "Failed to undo artifact", { allowRawMessage: true }),
        };
    }
}

/**
 * Get an artifact by ID
 */
export async function getArtifactAction(artifactId: string) {
    try {
        const artifact = await withAuth(async ({ userId, workspaceId }) => {
            await assertArtifactAccess(artifactId, userId, workspaceId);
            return getArtifact(artifactId);
        });
        if (!artifact) return { success: false, error: "Artifact not found" };
        return { success: true, artifact };
    } catch (error) {
        return {
            success: false,
            error: sanitizeErrorMessage(error, "Failed to get artifact", { allowRawMessage: true }),
        };
    }
}

/**
 * Get the timeline view of a run
 */
export async function getRunTimelineAction(runId: string) {
    try {
        const timeline = await withAuth(async ({ userId, workspaceId }) => {
            await assertRunAccess(runId, userId, workspaceId);
            return getRunTimeline(runId);
        });
        return { success: true, timeline };
    } catch (error) {
        return {
            success: false,
            error: sanitizeErrorMessage(error, "Failed to get run timeline", { allowRawMessage: true }),
        };
    }
}

/**
 * Get current autonomy config
 */
export async function getAutonomyConfigAction(projectId?: string) {
    try {
        const config = await withAuth(({ userId }) =>
            getAutonomyConfig(userId, projectId),
        );
        return { success: true as const, config };
    } catch (error) {
        return {
            success: false as const,
            error: sanitizeErrorMessage(error, "Failed to get autonomy config", { allowRawMessage: true }),
        };
    }
}

/**
 * Update autonomy config
 */
export async function updateAutonomyAction(
    preset: AutonomyPreset,
    toolOverrides?: Record<string, AutonomyLevel>,
    projectId?: string,
) {
    try {
        const config = await withAuth(({ userId }) =>
            updateAutonomyConfig(userId, preset, toolOverrides, projectId),
        );
        return { success: true as const, config };
    } catch (error) {
        return {
            success: false as const,
            error: sanitizeErrorMessage(error, "Failed to update autonomy config", { allowRawMessage: true }),
        };
    }
}
