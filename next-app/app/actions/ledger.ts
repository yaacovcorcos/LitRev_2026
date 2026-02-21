"use server";

import type { Study } from "@/types/ledger";
import { listStudies, replaceStudies, deleteStudy, deleteStudies, upsertStudy, getStudy, updateStudy, addMentionedStudy } from "@/lib/server/ledger";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import type { MentionedStudyInput, MentionedStudyUpsertResult, StudyInput } from "@/lib/server/ledger";

export async function listStudiesAction(projectId: string): Promise<Study[]> {
  return listStudies(SINGLE_USER_SCOPE, projectId);
}

export async function replaceStudiesAction(projectId: string, studies: Study[]): Promise<Study[]> {
  return replaceStudies(SINGLE_USER_SCOPE, projectId, studies);
}

export async function upsertStudyAction(projectId: string, study: Study): Promise<Study> {
  return upsertStudy(SINGLE_USER_SCOPE, projectId, study);
}

export async function deleteStudyAction(projectId: string, studyId: string): Promise<void> {
  return deleteStudy(SINGLE_USER_SCOPE, projectId, studyId);
}

export async function deleteStudiesAction(projectId: string, studyIds: string[]): Promise<void> {
  return deleteStudies(SINGLE_USER_SCOPE, projectId, studyIds);
}

export async function getStudyAction(projectId: string, studyId: string): Promise<Study | null> {
  return getStudy(SINGLE_USER_SCOPE, projectId, studyId);
}

export async function updateStudyAction(
  projectId: string,
  studyId: string,
  updates: Partial<StudyInput>
): Promise<Study> {
  return updateStudy(SINGLE_USER_SCOPE, projectId, studyId, updates);
}

export async function addMentionedStudyAction(
  projectId: string,
  mention: MentionedStudyInput
): Promise<MentionedStudyUpsertResult> {
  return addMentionedStudy(SINGLE_USER_SCOPE, projectId, mention);
}
