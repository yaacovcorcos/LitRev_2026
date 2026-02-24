"use server";

import type { Study } from "@/types/ledger";
import { listStudies, replaceStudies, deleteStudy, deleteStudies, upsertStudy, getStudy, updateStudy, addMentionedStudy } from "@/lib/server/ledger";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import type { MentionedStudyInput, MentionedStudyUpsertResult, StudyInput } from "@/lib/server/ledger";
import { withAction, type ActionResult } from "@/lib/server/action-utils";

export async function listStudiesAction(projectId: string): Promise<ActionResult<Study[]>> {
  return withAction(() => listStudies(SINGLE_USER_SCOPE, projectId));
}

export async function replaceStudiesAction(projectId: string, studies: Study[]): Promise<ActionResult<Study[]>> {
  return withAction(() => replaceStudies(SINGLE_USER_SCOPE, projectId, studies));
}

export async function upsertStudyAction(projectId: string, study: Study): Promise<ActionResult<Study>> {
  return withAction(() => upsertStudy(SINGLE_USER_SCOPE, projectId, study));
}

export async function deleteStudyAction(projectId: string, studyId: string): Promise<ActionResult<void>> {
  return withAction(() => deleteStudy(SINGLE_USER_SCOPE, projectId, studyId));
}

export async function deleteStudiesAction(projectId: string, studyIds: string[]): Promise<ActionResult<void>> {
  return withAction(() => deleteStudies(SINGLE_USER_SCOPE, projectId, studyIds));
}

export async function getStudyAction(projectId: string, studyId: string): Promise<ActionResult<Study | null>> {
  return withAction(() => getStudy(SINGLE_USER_SCOPE, projectId, studyId));
}

export async function updateStudyAction(
  projectId: string,
  studyId: string,
  updates: Partial<StudyInput>
): Promise<ActionResult<Study>> {
  return withAction(() => updateStudy(SINGLE_USER_SCOPE, projectId, studyId, updates));
}

export async function addMentionedStudyAction(
  projectId: string,
  mention: MentionedStudyInput
): Promise<ActionResult<MentionedStudyUpsertResult>> {
  return withAction(() => addMentionedStudy(SINGLE_USER_SCOPE, projectId, mention));
}
