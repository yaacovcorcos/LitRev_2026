"use server";

import { z } from "zod";
import type { FileAsset } from "@/types/files";
import type { Study } from "@/types/ledger";
import type { OpenAccessPdfImportResult } from "@/lib/server/files";
import type { FileAssetInput } from "@/lib/server/files";
import { createFileAsset, deleteFileAsset, listProjectFiles, listStudyFiles, uploadStudyFile, importStudyWithPdf, uploadChatAttachment, extractTextFromExistingFile, importOpenAccessPdfForStudy } from "@/lib/server/files";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema, studyIdSchema, resourceIdSchema } from "@/lib/schemas/ids";
import { fileAssetInputSchema } from "@/lib/schemas/files";

export async function listProjectFilesAction(projectId: string): Promise<ActionResult<FileAsset[]>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) =>
      listProjectFiles({ ownerId: userId, workspaceId }, id),
    ),
  );
}

const listStudyFilesInput = z.object({
  projectId: projectIdSchema,
  studyId: studyIdSchema,
});

export async function listStudyFilesAction(projectId: string, studyId: string): Promise<ActionResult<FileAsset[]>> {
  return withValidatedAction(listStudyFilesInput, { projectId, studyId },
    (v) => withAuth(({ userId, workspaceId }) =>
      listStudyFiles({ ownerId: userId, workspaceId }, v.projectId, v.studyId),
    ),
  );
}

const createFileAssetInput = z.object({
  projectId: projectIdSchema,
  input: fileAssetInputSchema,
});

export async function createFileAssetAction(projectId: string, input: FileAssetInput): Promise<ActionResult<FileAsset>> {
  return withValidatedAction(createFileAssetInput, { projectId, input },
    (v) => withAuth(({ userId, workspaceId }) =>
      createFileAsset({ ownerId: userId, workspaceId }, v.projectId, v.input as FileAssetInput),
    ),
  );
}

const deleteFileAssetInput = z.object({
  projectId: projectIdSchema,
  fileId: resourceIdSchema,
});

export async function deleteFileAssetAction(projectId: string, fileId: string): Promise<ActionResult<void>> {
  return withValidatedAction(deleteFileAssetInput, { projectId, fileId },
    (v) => withAuth(({ userId, workspaceId }) =>
      deleteFileAsset({ ownerId: userId, workspaceId }, v.projectId, v.fileId),
    ),
  );
}

const uploadStudyFileInput = z.object({
  projectId: projectIdSchema,
  studyId: studyIdSchema,
});

export async function uploadStudyFileAction(
  projectId: string,
  studyId: string,
  formData: FormData
): Promise<ActionResult<FileAsset>> {
  return withValidatedAction(uploadStudyFileInput, { projectId, studyId },
    (v) => withAuth(({ userId, workspaceId }) => {
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new Error("File is required.");
      }
      return uploadStudyFile({ ownerId: userId, workspaceId }, v.projectId, v.studyId, file);
    }),
  );
}

export async function importStudyWithPdfAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<{ study: Study; fileAsset: FileAsset }>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) => {
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new Error("File is required.");
      }
      return importStudyWithPdf({ ownerId: userId, workspaceId }, id, file);
    }),
  );
}

export async function uploadChatAttachmentAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<{ fileAssetId: string; filename: string; size: number; mimeType: string; extractedText: string; publicUrl?: string }>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(async ({ userId, workspaceId }) => {
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new Error("File is required.");
      }
      const { fileAsset, extractedText } = await uploadChatAttachment(
        { ownerId: userId, workspaceId }, id, file
      );
      return {
        fileAssetId: fileAsset.id,
        filename: fileAsset.filename,
        size: fileAsset.size,
        mimeType: fileAsset.mimeType,
        extractedText,
        publicUrl: fileAsset.publicUrl,
      };
    }),
  );
}

const extractTextFromExistingFileInput = z.object({
  projectId: projectIdSchema,
  fileAssetId: resourceIdSchema,
});

export async function extractTextFromExistingFileAction(
  projectId: string,
  fileAssetId: string
): Promise<ActionResult<{ fileAssetId: string; filename: string; size: number; mimeType: string; extractedText: string }>> {
  return withValidatedAction(extractTextFromExistingFileInput, { projectId, fileAssetId },
    (v) => withAuth(async ({ userId, workspaceId }) => {
      const { fileAsset, extractedText } = await extractTextFromExistingFile(
        { ownerId: userId, workspaceId }, v.projectId, v.fileAssetId
      );
      return {
        fileAssetId: fileAsset.id,
        filename: fileAsset.filename,
        size: fileAsset.size,
        mimeType: fileAsset.mimeType,
        extractedText,
      };
    }),
  );
}

const fetchOpenAccessPdfInput = z.object({
  projectId: projectIdSchema,
  studyId: studyIdSchema,
  doi: z.string().optional(),
  pmid: z.string().optional(),
});

export async function fetchOpenAccessPdfForStudyAction(
  projectId: string,
  studyId: string,
  options?: { doi?: string; pmid?: string }
): Promise<OpenAccessPdfImportResult> {
  try {
    const v = fetchOpenAccessPdfInput.parse({
      projectId,
      studyId,
      doi: options?.doi,
      pmid: options?.pmid,
    });
    return await withAuth(({ userId, workspaceId }) =>
      importOpenAccessPdfForStudy(
        { ownerId: userId, workspaceId },
        v.projectId,
        v.studyId,
        { doi: v.doi, pmid: v.pmid }
      )
    );
  } catch (error) {
    return {
      success: false,
      status: "failed",
      errorCode: "UNKNOWN_ERROR",
      error: error instanceof Error ? error.message : "Failed to fetch open-access PDF.",
    };
  }
}
