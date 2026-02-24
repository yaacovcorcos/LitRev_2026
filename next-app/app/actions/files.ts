"use server";

import type { FileAsset } from "@/types/files";
import type { Study } from "@/types/ledger";
import type { FileAssetInput } from "@/lib/server/files";
import { createFileAsset, deleteFileAsset, listProjectFiles, listStudyFiles, uploadStudyFile, importStudyWithPdf, uploadChatAttachment, extractTextFromExistingFile } from "@/lib/server/files";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { withAction, type ActionResult } from "@/lib/server/action-utils";

export async function listProjectFilesAction(projectId: string): Promise<ActionResult<FileAsset[]>> {
  return withAction(() => listProjectFiles(SINGLE_USER_SCOPE, projectId));
}

export async function listStudyFilesAction(projectId: string, studyId: string): Promise<ActionResult<FileAsset[]>> {
  return withAction(() => listStudyFiles(SINGLE_USER_SCOPE, projectId, studyId));
}

export async function createFileAssetAction(projectId: string, input: FileAssetInput): Promise<ActionResult<FileAsset>> {
  return withAction(() => createFileAsset(SINGLE_USER_SCOPE, projectId, input));
}

export async function deleteFileAssetAction(projectId: string, fileId: string): Promise<ActionResult<void>> {
  return withAction(() => deleteFileAsset(SINGLE_USER_SCOPE, projectId, fileId));
}

export async function uploadStudyFileAction(
  projectId: string,
  studyId: string,
  formData: FormData
): Promise<ActionResult<FileAsset>> {
  return withAction(() => {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("File is required.");
    }
    return uploadStudyFile(SINGLE_USER_SCOPE, projectId, studyId, file);
  });
}

export async function importStudyWithPdfAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<{ study: Study; fileAsset: FileAsset }>> {
  return withAction(() => {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("File is required.");
    }
    return importStudyWithPdf(SINGLE_USER_SCOPE, projectId, file);
  });
}

export async function uploadChatAttachmentAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<{ fileAssetId: string; filename: string; size: number; mimeType: string; extractedText: string; publicUrl?: string }>> {
  return withAction(async () => {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("File is required.");
    }
    const { fileAsset, extractedText } = await uploadChatAttachment(
      SINGLE_USER_SCOPE, projectId, file
    );
    return {
      fileAssetId: fileAsset.id,
      filename: fileAsset.filename,
      size: fileAsset.size,
      mimeType: fileAsset.mimeType,
      extractedText,
      publicUrl: fileAsset.publicUrl,
    };
  });
}

export async function extractTextFromExistingFileAction(
  projectId: string,
  fileAssetId: string
): Promise<ActionResult<{ fileAssetId: string; filename: string; size: number; mimeType: string; extractedText: string }>> {
  return withAction(async () => {
    const { fileAsset, extractedText } = await extractTextFromExistingFile(
      SINGLE_USER_SCOPE, projectId, fileAssetId
    );
    return {
      fileAssetId: fileAsset.id,
      filename: fileAsset.filename,
      size: fileAsset.size,
      mimeType: fileAsset.mimeType,
      extractedText,
    };
  });
}
