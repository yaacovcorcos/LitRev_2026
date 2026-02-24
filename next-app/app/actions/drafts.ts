"use server";

import type { DraftState } from "@/lib/draftStorage";
import { getDraft, saveDraft } from "@/lib/server/drafts";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { withAction, type ActionResult } from "@/lib/server/action-utils";

export async function getDraftAction(projectId: string): Promise<ActionResult<DraftState | null>> {
  return withAction(() => getDraft(SINGLE_USER_SCOPE, projectId));
}

export async function saveDraftAction(projectId: string, state: DraftState): Promise<ActionResult<DraftState>> {
  return withAction(() => saveDraft(SINGLE_USER_SCOPE, projectId, state));
}
