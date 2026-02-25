"use server";

import type { FileAsset } from "@/types/files";
import type { Study } from "@/types/ledger";
import type { FileAssetInput } from "@/lib/server/files";
import { createFileAsset, deleteFileAsset, listProjectFiles, listStudyFiles, uploadStudyFile, importStudyWithPdf, uploadChatAttachment, extractTextFromExistingFile } from "@/lib/server/files";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";

export async function listProjectFilesAction(projectId: string): Promise<ActionResult<FileAsset[]>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      listProjectFiles({ ownerId: userId, workspaceId }, projectId),
    ),
  );
}

export async function listStudyFilesAction(projectId: string, studyId: string): Promise<ActionResult<FileAsset[]>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      listStudyFiles({ ownerId: userId, workspaceId }, projectId, studyId),
    ),
  );
}

export async function createFileAssetAction(projectId: string, input: FileAssetInput): Promise<ActionResult<FileAsset>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      createFileAsset({ ownerId: userId, workspaceId }, projectId, input),
    ),
  );
}

export async function deleteFileAssetAction(projectId: string, fileId: string): Promise<ActionResult<void>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      deleteFileAsset({ ownerId: userId, workspaceId }, projectId, fileId),
    ),
  );
}

export async function uploadStudyFileAction(
  projectId: string,
  studyId: string,
  formData: FormData
): Promise<ActionResult<FileAsset>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) => {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("File is required.");
    }
      return uploadStudyFile({ ownerId: userId, workspaceId }, projectId, studyId, file);
    }),
  );
}

export async function importStudyWithPdfAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<{ study: Study; fileAsset: FileAsset }>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) => {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("File is required.");
    }
      return importStudyWithPdf({ ownerId: userId, workspaceId }, projectId, file);
    }),
  );
}

export async function uploadChatAttachmentAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<{ fileAssetId: string; filename: string; size: number; mimeType: string; extractedText: string; publicUrl?: string }>> {
  return withAction(() =>
    withAuth(async ({ userId, workspaceId }) => {
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new Error("File is required.");
      }
      const { fileAsset, extractedText } = await uploadChatAttachment(
        { ownerId: userId, workspaceId }, projectId, file
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

export async function extractTextFromExistingFileAction(
  projectId: string,
  fileAssetId: string
): Promise<ActionResult<{ fileAssetId: string; filename: string; size: number; mimeType: string; extractedText: string }>> {
  return withAction(() =>
    withAuth(async ({ userId, workspaceId }) => {
      const { fileAsset, extractedText } = await extractTextFromExistingFile(
        { ownerId: userId, workspaceId }, projectId, fileAssetId
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
