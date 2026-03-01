"use server";

import { z } from "zod";
import type { Study } from "@/types/ledger";
import { listStudies, listStudiesPaginated, replaceStudies, deleteStudy, deleteStudies, upsertStudy, getStudy, updateStudy, addMentionedStudy } from "@/lib/server/ledger";
import type {
  MentionedStudyInput,
  MentionedStudyUpsertResult,
  PaginationOptions,
  PaginatedResult,
  StudyInput,
} from "@/lib/server/ledger";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema, studyIdSchema, cuidSchema } from "@/lib/schemas/ids";
import { studySchema, paginationOptionsSchema, mentionedStudyInputSchema } from "@/lib/schemas/ledger";

export async function listStudiesAction(projectId: string): Promise<ActionResult<Study[]>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) =>
      listStudies({ ownerId: userId, workspaceId }, id),
    ),
  );
}

const listStudiesPaginatedInput = z.object({
  projectId: projectIdSchema,
  options: paginationOptionsSchema.optional(),
});

export async function listStudiesPaginatedAction(
  projectId: string,
  options?: PaginationOptions,
): Promise<ActionResult<PaginatedResult<Study>>> {
  return withValidatedAction(listStudiesPaginatedInput, { projectId, options },
    (v) => withAuth(({ userId, workspaceId }) =>
      listStudiesPaginated({ ownerId: userId, workspaceId }, v.projectId, v.options as PaginationOptions | undefined),
    ),
  );
}

const replaceStudiesInput = z.object({
  projectId: projectIdSchema,
  studies: z.array(studySchema),
});

export async function replaceStudiesAction(projectId: string, studies: Study[]): Promise<ActionResult<Study[]>> {
  return withValidatedAction(replaceStudiesInput, { projectId, studies },
    (v) => withAuth(({ userId, workspaceId }) =>
      replaceStudies({ ownerId: userId, workspaceId }, v.projectId, v.studies as Study[]),
    ),
  );
}

const upsertStudyInput = z.object({
  projectId: projectIdSchema,
  study: studySchema,
});

export async function upsertStudyAction(projectId: string, study: Study): Promise<ActionResult<Study>> {
  return withValidatedAction(upsertStudyInput, { projectId, study },
    (v) => withAuth(({ userId, workspaceId }) =>
      upsertStudy({ ownerId: userId, workspaceId }, v.projectId, v.study as Study),
    ),
  );
}

const deleteStudyInput = z.object({
  projectId: projectIdSchema,
  studyId: studyIdSchema,
});

export async function deleteStudyAction(projectId: string, studyId: string): Promise<ActionResult<void>> {
  return withValidatedAction(deleteStudyInput, { projectId, studyId },
    (v) => withAuth(({ userId, workspaceId }) =>
      deleteStudy({ ownerId: userId, workspaceId }, v.projectId, v.studyId),
    ),
  );
}

const deleteStudiesInput = z.object({
  projectId: projectIdSchema,
  studyIds: z.array(cuidSchema),
});

export async function deleteStudiesAction(projectId: string, studyIds: string[]): Promise<ActionResult<void>> {
  return withValidatedAction(deleteStudiesInput, { projectId, studyIds },
    (v) => withAuth(({ userId, workspaceId }) =>
      deleteStudies({ ownerId: userId, workspaceId }, v.projectId, v.studyIds),
    ),
  );
}

const getStudyInput = z.object({
  projectId: projectIdSchema,
  studyId: studyIdSchema,
});

export async function getStudyAction(projectId: string, studyId: string): Promise<ActionResult<Study | null>> {
  return withValidatedAction(getStudyInput, { projectId, studyId },
    (v) => withAuth(({ userId, workspaceId }) =>
      getStudy({ ownerId: userId, workspaceId }, v.projectId, v.studyId),
    ),
  );
}

const updateStudyInput = z.object({
  projectId: projectIdSchema,
  studyId: studyIdSchema,
  updates: studySchema.partial(),
});

export async function updateStudyAction(
  projectId: string,
  studyId: string,
  updates: Partial<StudyInput>
): Promise<ActionResult<Study>> {
  return withValidatedAction(updateStudyInput, { projectId, studyId, updates },
    (v) => withAuth(({ userId, workspaceId }) =>
      updateStudy({ ownerId: userId, workspaceId }, v.projectId, v.studyId, v.updates as Partial<StudyInput>),
    ),
  );
}

const addMentionedStudyInput = z.object({
  projectId: projectIdSchema,
  mention: mentionedStudyInputSchema,
});

export async function addMentionedStudyAction(
  projectId: string,
  mention: MentionedStudyInput
): Promise<ActionResult<MentionedStudyUpsertResult>> {
  return withValidatedAction(addMentionedStudyInput, { projectId, mention },
    (v) => withAuth(({ userId, workspaceId }) =>
      addMentionedStudy({ ownerId: userId, workspaceId }, v.projectId, v.mention as MentionedStudyInput),
    ),
  );
}
