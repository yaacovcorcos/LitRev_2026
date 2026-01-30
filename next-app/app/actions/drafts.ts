"use server";

import type { DraftState } from "@/lib/draftStorage";
import { getDraft, saveDraft } from "@/lib/server/drafts";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";

export async function getDraftAction(projectId: string): Promise<DraftState | null> {
  return getDraft(SINGLE_USER_SCOPE, projectId);
}

export async function saveDraftAction(projectId: string, state: DraftState): Promise<DraftState> {
  return saveDraft(SINGLE_USER_SCOPE, projectId, state);
}
