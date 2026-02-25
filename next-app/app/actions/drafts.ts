"use server";

import type { DraftState } from "@/lib/draftStorage";
import { getDraft, saveDraft } from "@/lib/server/drafts";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";

export async function getDraftAction(projectId: string): Promise<ActionResult<DraftState | null>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      getDraft({ ownerId: userId, workspaceId }, projectId),
    ),
  );
}

export async function saveDraftAction(projectId: string, state: DraftState): Promise<ActionResult<DraftState>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      saveDraft({ ownerId: userId, workspaceId }, projectId, state),
    ),
  );
}
