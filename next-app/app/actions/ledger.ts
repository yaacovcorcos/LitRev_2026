"use server";

import type { Study } from "@/types/ledger";
import { listStudies, replaceStudies, deleteStudy, upsertStudy, getStudy, updateStudy } from "@/lib/server/ledger";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import type { StudyInput } from "@/lib/server/ledger";

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
