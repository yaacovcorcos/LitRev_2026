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
import type { ArtifactStatus } from "@/types/artifacts";
import type { AutonomyPreset, AutonomyLevel } from "@/types/agent";

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
        const result = await reviewArtifact(artifactId, status, reviewNote, editedPayload);

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
        const result = await undoArtifact(artifactId);
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
        const artifact = await getArtifact(artifactId);
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
        const timeline = await getRunTimeline(runId);
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
export async function getAutonomyConfigAction(projectId?: string, userId?: string) {
    try {
        const config = await getAutonomyConfig(userId || "single-user", projectId);
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
    userId?: string,
) {
    try {
        const config = await updateAutonomyConfig(userId || "single-user", preset, toolOverrides, projectId);
        return { success: true as const, config };
    } catch (error) {
        return {
            success: false as const,
            error: sanitizeErrorMessage(error, "Failed to update autonomy config", { allowRawMessage: true }),
        };
    }
}
