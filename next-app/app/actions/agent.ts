/**
 * Agent Server Actions
 * Client-callable actions for artifact review, undo, and autonomy config
 * (planC Phase 0.5)
 */

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { reviewArtifact, undoArtifact, getArtifact } from "@/lib/server/agent/artifacts";
import { getRunTimeline } from "@/lib/server/agent/events";
import { getRunLineage } from "@/lib/server/agent/run";
import { getAutonomyConfig, updateAutonomyConfig } from "@/lib/server/agent/autonomy";
import { getSafeErrorDetails, sanitizeErrorMessage } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import { cuidSchema, projectIdSchema } from "@/lib/schemas/ids";
import { artifactReviewStatusSchema, autonomyPresetSchema, toolOverridesSchema } from "@/lib/schemas/agent";
import type { ArtifactStatus } from "@/types/artifacts";
import type { AutonomyPreset, AutonomyLevel } from "@/types/agent";
import { ArtifactError } from "@/lib/server/agent/artifact-errors";
import { assertProjectAccess } from "@/lib/server/access";

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
        throw new ArtifactError("ARTIFACT_ACCESS_DENIED", "Artifact not found or access denied");
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
const reviewArtifactInput = z.object({
    artifactId: cuidSchema,
    status: artifactReviewStatusSchema,
    reviewNote: z.string().max(10_000).optional(),
    editedPayload: z.record(z.string(), z.unknown()).optional(),
});

export async function reviewArtifactAction(
    artifactId: string,
    status: Extract<ArtifactStatus, "accepted" | "rejected" | "edited">,
    reviewNote?: string,
    editedPayload?: Record<string, unknown>,
) {
    try {
        const v = reviewArtifactInput.parse({ artifactId, status, reviewNote, editedPayload });
        const result = await withAuth(async ({ userId, workspaceId }) => {
            await assertArtifactAccess(v.artifactId, userId, workspaceId);
            return reviewArtifact(
                v.artifactId,
                v.status as Extract<ArtifactStatus, "accepted" | "rejected" | "edited">,
                v.reviewNote,
                v.editedPayload,
                { actorUserId: userId },
            );
        });

        if (status === "accepted" && (result.type === "study_update" || result.type === "study_deletion")) {
            const payload = (result.payload ?? {}) as { studyId?: string };
            if (result.projectId && payload.studyId) {
                revalidatePath(`/project/${result.projectId}/ledger/${payload.studyId}`);
                revalidatePath(`/project/${result.projectId}/ledger`);
            }
        }

        return { success: true, artifact: result };
    } catch (error) {
        const safeError = getSafeErrorDetails(error, "Failed to review artifact", { allowRawMessage: true });
        return {
            success: false,
            error: safeError.error,
            errorCode: safeError.errorCode,
        };
    }
}

/**
 * Undo an applied artifact
 */
export async function undoArtifactAction(artifactId: string) {
    try {
        const id = cuidSchema.parse(artifactId);
        const result = await withAuth(async ({ userId, workspaceId }) => {
            await assertArtifactAccess(id, userId, workspaceId);
            return undoArtifact(id);
        });
        if (result.type === "study_update" || result.type === "study_deletion") {
            const payload = (result.payload ?? {}) as { studyId?: string };
            if (result.projectId && payload.studyId) {
                revalidatePath(`/project/${result.projectId}/ledger/${payload.studyId}`);
                revalidatePath(`/project/${result.projectId}/ledger`);
            }
        }
        return { success: true, artifact: result };
    } catch (error) {
        const safeError = getSafeErrorDetails(error, "Failed to undo artifact", { allowRawMessage: true });
        return {
            success: false,
            error: safeError.error,
            errorCode: safeError.errorCode,
        };
    }
}

/**
 * Get an artifact by ID
 */
export async function getArtifactAction(artifactId: string) {
    try {
        const id = cuidSchema.parse(artifactId);
        const artifact = await withAuth(async ({ userId, workspaceId }) => {
            await assertArtifactAccess(id, userId, workspaceId);
            return getArtifact(id);
        });
        if (!artifact) {
            return {
                success: false as const,
                error: "The requested artifact was not found.",
                errorCode: "ARTIFACT_NOT_FOUND",
            };
        }
        return { success: true, artifact };
    } catch (error) {
        const safeError = getSafeErrorDetails(error, "Failed to get artifact", { allowRawMessage: true });
        return {
            success: false,
            error: safeError.error,
            errorCode: safeError.errorCode,
        };
    }
}

/**
 * Get the timeline view of a run
 */
export async function getRunTimelineAction(runId: string) {
    try {
        const id = cuidSchema.parse(runId);
        const timeline = await withAuth(async ({ userId, workspaceId }) => {
            await assertRunAccess(id, userId, workspaceId);
            return getRunTimeline(id);
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
 * Get the run lineage tree (root run + delegated child runs) for a run.
 */
export async function getRunLineageAction(runId: string) {
    try {
        const id = cuidSchema.parse(runId);
        const lineage = await withAuth(async ({ userId, workspaceId }) => {
            await assertRunAccess(id, userId, workspaceId);
            const result = await getRunLineage(id);
            if (!result) return null;
            const pending = [result];
            while (pending.length > 0) {
                const node = pending.pop();
                if (!node) continue;
                await assertRunAccess(node.id, userId, workspaceId);
                pending.push(...node.children);
            }
            return result;
        });
        if (!lineage) {
            return { success: false as const, error: "Run not found" };
        }
        return { success: true as const, lineage };
    } catch (error) {
        return {
            success: false as const,
            error: sanitizeErrorMessage(error, "Failed to get run lineage", { allowRawMessage: true }),
        };
    }
}

/**
 * Get current autonomy config
 */
export async function getAutonomyConfigAction(projectId?: string) {
    try {
        const id = projectIdSchema.optional().parse(projectId);
        const config = await withAuth(async ({ userId, workspaceId }) => {
            if (id) {
                await assertProjectAccess({ ownerId: userId, workspaceId }, id);
            }
            return getAutonomyConfig(userId, id);
        });
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
const updateAutonomyInput = z.object({
    preset: autonomyPresetSchema,
    toolOverrides: toolOverridesSchema.optional(),
    projectId: projectIdSchema.optional(),
});

export async function updateAutonomyAction(
    preset: AutonomyPreset,
    toolOverrides?: Record<string, AutonomyLevel>,
    projectId?: string,
) {
    try {
        const v = updateAutonomyInput.parse({ preset, toolOverrides, projectId });
        const config = await withAuth(async ({ userId, workspaceId }) => {
            if (v.projectId) {
                await assertProjectAccess({ ownerId: userId, workspaceId }, v.projectId);
            }
            return updateAutonomyConfig(
                userId,
                v.preset as AutonomyPreset,
                v.toolOverrides as Record<string, AutonomyLevel> | undefined,
                v.projectId,
            );
        });
        return { success: true as const, config };
    } catch (error) {
        return {
            success: false as const,
            error: sanitizeErrorMessage(error, "Failed to update autonomy config", { allowRawMessage: true }),
        };
    }
}
