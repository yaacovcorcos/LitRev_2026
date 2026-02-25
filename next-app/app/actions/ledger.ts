"use server";

import type { Study } from "@/types/ledger";
import { listStudies, replaceStudies, deleteStudy, deleteStudies, upsertStudy, getStudy, updateStudy, addMentionedStudy } from "@/lib/server/ledger";
import type { MentionedStudyInput, MentionedStudyUpsertResult, StudyInput } from "@/lib/server/ledger";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";

export async function listStudiesAction(projectId: string): Promise<ActionResult<Study[]>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      listStudies({ ownerId: userId, workspaceId }, projectId),
    ),
  );
}

export async function replaceStudiesAction(projectId: string, studies: Study[]): Promise<ActionResult<Study[]>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      replaceStudies({ ownerId: userId, workspaceId }, projectId, studies),
    ),
  );
}

export async function upsertStudyAction(projectId: string, study: Study): Promise<ActionResult<Study>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      upsertStudy({ ownerId: userId, workspaceId }, projectId, study),
    ),
  );
}

export async function deleteStudyAction(projectId: string, studyId: string): Promise<ActionResult<void>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      deleteStudy({ ownerId: userId, workspaceId }, projectId, studyId),
    ),
  );
}

export async function deleteStudiesAction(projectId: string, studyIds: string[]): Promise<ActionResult<void>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      deleteStudies({ ownerId: userId, workspaceId }, projectId, studyIds),
    ),
  );
}

export async function getStudyAction(projectId: string, studyId: string): Promise<ActionResult<Study | null>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      getStudy({ ownerId: userId, workspaceId }, projectId, studyId),
    ),
  );
}

export async function updateStudyAction(
  projectId: string,
  studyId: string,
  updates: Partial<StudyInput>
): Promise<ActionResult<Study>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      updateStudy({ ownerId: userId, workspaceId }, projectId, studyId, updates),
    ),
  );
}

export async function addMentionedStudyAction(
  projectId: string,
  mention: MentionedStudyInput
): Promise<ActionResult<MentionedStudyUpsertResult>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      addMentionedStudy({ ownerId: userId, workspaceId }, projectId, mention),
    ),
  );
}
