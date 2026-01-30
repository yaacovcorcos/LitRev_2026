"use server";

import type { FileAsset } from "@/types/files";
import type { FileAssetInput } from "@/lib/server/files";
import { createFileAsset, deleteFileAsset, listProjectFiles, uploadStudyFile } from "@/lib/server/files";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";

export async function listProjectFilesAction(projectId: string): Promise<FileAsset[]> {
  return listProjectFiles(SINGLE_USER_SCOPE, projectId);
}

export async function createFileAssetAction(projectId: string, input: FileAssetInput): Promise<FileAsset> {
  return createFileAsset(SINGLE_USER_SCOPE, projectId, input);
}

export async function deleteFileAssetAction(projectId: string, fileId: string): Promise<void> {
  return deleteFileAsset(SINGLE_USER_SCOPE, projectId, fileId);
}

export async function uploadStudyFileAction(
  projectId: string,
  studyId: string,
  formData: FormData
): Promise<FileAsset> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("File is required.");
  }
  return uploadStudyFile(SINGLE_USER_SCOPE, projectId, studyId, file);
}
