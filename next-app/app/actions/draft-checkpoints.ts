"use server";

import { z } from "zod";
import { withAuth } from "@/lib/server/auth/session";
import { sanitizeErrorMessage } from "@/lib/server/action-utils";
import { createDraftCheckpoint, listDraftCheckpoints, getDraftCheckpoint, compareDraftCheckpoint, restoreDraftCheckpoint } from "@/lib/server/draft-checkpoints";
import { draftStateSchema, normalizeDraftStateInput } from "@/lib/schemas/drafts";
import { projectIdSchema, resourceIdSchema } from "@/lib/schemas/ids";

const checkpointKindSchema = z.enum(["manual", "ai_apply", "export"]);

const createDraftCheckpointInput = z.object({
  projectId: projectIdSchema,
  label: z.string().trim().max(200).optional(),
  kind: checkpointKindSchema,
  draftState: z.preprocess(normalizeDraftStateInput, draftStateSchema),
  fileAssetId: resourceIdSchema.optional(),
  artifactId: resourceIdSchema.optional(),
  conversationId: resourceIdSchema.optional(),
});

const projectCheckpointInput = z.object({
  projectId: projectIdSchema,
  checkpointId: resourceIdSchema,
});

export async function createDraftCheckpointAction(input: z.input<typeof createDraftCheckpointInput>) {
  try {
    const validated = createDraftCheckpointInput.parse(input);
    const checkpoint = await withAuth(({ userId, workspaceId }) =>
      createDraftCheckpoint(
        { ownerId: userId, workspaceId },
        {
          projectId: validated.projectId,
          label: validated.label,
          kind: validated.kind,
          draftState: validated.draftState,
          fileAssetId: validated.fileAssetId,
          artifactId: validated.artifactId,
          conversationId: validated.conversationId,
        },
      ),
    );
    return { success: true as const, data: checkpoint };
  } catch (error) {
    return {
      success: false as const,
      error: sanitizeErrorMessage(error, "Failed to create draft checkpoint", { allowRawMessage: true }),
    };
  }
}

export async function listDraftCheckpointsAction(projectId: string) {
  try {
    const validatedProjectId = projectIdSchema.parse(projectId);
    const checkpoints = await withAuth(({ userId, workspaceId }) =>
      listDraftCheckpoints({ ownerId: userId, workspaceId }, validatedProjectId),
    );
    return { success: true as const, data: checkpoints };
  } catch (error) {
    return {
      success: false as const,
      error: sanitizeErrorMessage(error, "Failed to list draft checkpoints", { allowRawMessage: true }),
    };
  }
}

export async function getDraftCheckpointAction(projectId: string, checkpointId: string) {
  try {
    const validated = projectCheckpointInput.parse({ projectId, checkpointId });
    const checkpoint = await withAuth(({ userId, workspaceId }) =>
      getDraftCheckpoint({ ownerId: userId, workspaceId }, validated.projectId, validated.checkpointId),
    );
    return { success: true as const, data: checkpoint };
  } catch (error) {
    return {
      success: false as const,
      error: sanitizeErrorMessage(error, "Failed to load draft checkpoint", { allowRawMessage: true }),
    };
  }
}

export async function compareDraftCheckpointAction(projectId: string, checkpointId: string) {
  try {
    const validated = projectCheckpointInput.parse({ projectId, checkpointId });
    const comparison = await withAuth(({ userId, workspaceId }) =>
      compareDraftCheckpoint({ ownerId: userId, workspaceId }, validated.projectId, validated.checkpointId),
    );
    return { success: true as const, data: comparison };
  } catch (error) {
    return {
      success: false as const,
      error: sanitizeErrorMessage(error, "Failed to compare draft checkpoint", { allowRawMessage: true }),
    };
  }
}

export async function restoreDraftCheckpointAction(projectId: string, checkpointId: string) {
  try {
    const validated = projectCheckpointInput.parse({ projectId, checkpointId });
    const restored = await withAuth(({ userId, workspaceId }) =>
      restoreDraftCheckpoint({ ownerId: userId, workspaceId }, validated.projectId, validated.checkpointId),
    );
    return { success: true as const, data: restored };
  } catch (error) {
    return {
      success: false as const,
      error: sanitizeErrorMessage(error, "Failed to restore draft checkpoint", { allowRawMessage: true }),
    };
  }
}
