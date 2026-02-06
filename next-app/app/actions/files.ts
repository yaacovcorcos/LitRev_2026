"use server";

import type { FileAsset } from "@/types/files";
import type { Study } from "@/types/ledger";
import type { FileAssetInput } from "@/lib/server/files";
import { createFileAsset, deleteFileAsset, listProjectFiles, listStudyFiles, uploadStudyFile, importStudyWithPdf, uploadChatAttachment, extractTextFromExistingFile } from "@/lib/server/files";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { extractStudyFromPdf } from "@/lib/server/pdf-extraction";
import { updateStudy } from "@/lib/server/ledger";

export async function listProjectFilesAction(projectId: string): Promise<FileAsset[]> {
  return listProjectFiles(SINGLE_USER_SCOPE, projectId);
}

export async function listStudyFilesAction(projectId: string, studyId: string): Promise<FileAsset[]> {
  return listStudyFiles(SINGLE_USER_SCOPE, projectId, studyId);
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

export async function importStudyWithPdfAction(
  projectId: string,
  formData: FormData
): Promise<{ study: Study; fileAsset: FileAsset }> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("File is required.");
  }
  const { study, fileAsset } = await importStudyWithPdf(SINGLE_USER_SCOPE, projectId, file);

  // Auto-run Stage 1: quick extraction (title, authors, year, abstract, etc.)
  // Silent failure — if extraction fails, the study still exists with filename-based title
  try {
    const extraction = await extractStudyFromPdf(fileAsset.storagePath, projectId);
    if (extraction.success) {
      const updates: Record<string, unknown> = {
        status: "extracted",
        details: { ...extraction.details, source: "pdf-import" },
      };
      if (extraction.title && study.title === "Untitled Study") {
        updates.title = extraction.title;
      }
      if (extraction.authors && study.authors === "Unknown") {
        updates.authors = extraction.authors;
      }
      if (extraction.year && study.year === new Date().getFullYear()) {
        updates.year = extraction.year;
      }
      const updated = await updateStudy(SINGLE_USER_SCOPE, projectId, study.id, updates);
      return { study: updated, fileAsset };
    }
  } catch (err) {
    console.error("Auto Stage 1 extraction failed (non-fatal):", err);
  }

  return { study, fileAsset };
}

export async function uploadChatAttachmentAction(
  projectId: string,
  formData: FormData
): Promise<{ fileAssetId: string; filename: string; size: number; mimeType: string; extractedText: string; publicUrl?: string }> {
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
}

export async function extractTextFromExistingFileAction(
  projectId: string,
  fileAssetId: string
): Promise<{ fileAssetId: string; filename: string; size: number; mimeType: string; extractedText: string }> {
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
}
