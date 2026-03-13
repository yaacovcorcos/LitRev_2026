"use server";

import { z } from "zod";
import type { DraftState, DraftStateInput } from "@/lib/draftStorage";
import { getDraft, saveDraft } from "@/lib/server/drafts";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";
import { draftStateSchema, normalizeDraftStateInput } from "@/lib/schemas/drafts";

export async function getDraftAction(projectId: string): Promise<ActionResult<DraftState | null>> {
  return withValidatedAction(projectIdSchema, projectId, (validId) =>
    withAuth(({ userId, workspaceId }) =>
      getDraft({ ownerId: userId, workspaceId }, validId),
    ),
  );
}

const saveDraftInput = z.object({
  projectId: projectIdSchema,
  state: z.preprocess(normalizeDraftStateInput, draftStateSchema),
});

export async function saveDraftAction(projectId: string, state: DraftStateInput): Promise<ActionResult<DraftState>> {
  return withValidatedAction(saveDraftInput, { projectId, state }, (v) =>
    withAuth(({ userId, workspaceId }) =>
      saveDraft({ ownerId: userId, workspaceId }, v.projectId, v.state as DraftStateInput),
    ),
  );
}
