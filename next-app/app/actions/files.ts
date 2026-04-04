"use server";

import { z } from "zod";
import type { FileAsset } from "@/types/files";
import type { Study } from "@/types/ledger";
import { deleteFileAsset, listProjectFiles, listStudyFiles, uploadStudyFile, importStudyWithPdf, uploadChatAttachment, extractTextFromExistingFile } from "@/lib/server/files";
import { getStudy } from "@/lib/server/ledger";
import { enqueueStudyProcessingJob, kickStudyProcessingDispatcher } from "@/lib/server/study-processing";
import { classifyError, sanitizeErrorMessage, withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { logServerError } from "@/lib/server/logging";
import { projectIdSchema, studyIdSchema, resourceIdSchema } from "@/lib/schemas/ids";
import type { PendingAttachmentExtraction } from "@/types/copilot-context";

type FilesActionErrorCode =
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "LOCAL_SCHEMA_DRIFT";

type FailedFilesActionResult = {
  success: false;
  error: string;
  errorCode?: FilesActionErrorCode;
};

export type ImportStudyWithPdfActionResult =
  | { success: true; data: { study: Study; fileAsset: FileAsset } }
  | FailedFilesActionResult;

const LOCAL_SCHEMA_DRIFT_ERROR_CODE = "LOCAL_SCHEMA_DRIFT" as const;
const LOCAL_SCHEMA_DRIFT_MESSAGE =
  "PDF uploaded, but the app could not continue the follow-up processing flow because your local database schema is behind. Run npx prisma migrate dev from next-app/.";
const POST_IMPORT_FAILURE_MESSAGE =
  "PDF uploaded, but the app could not continue the follow-up processing flow. Please refresh and try again.";

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "";
}

function isLocalDatabaseRuntime(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL];
  return urls.some((value) => typeof value === "string" && /localhost|127\.0\.0\.1/i.test(value));
}

function isLikelyLocalSchemaDrift(error: unknown): boolean {
  if (!isLocalDatabaseRuntime()) return false;
  const raw = getErrorMessage(error).toLowerCase();
  if (!raw) return false;
  if (raw.includes("studyprocessingjob") || raw.includes("draftcheckpoint")) return true;
  if (raw.includes("p2021") || raw.includes("p2022")) return true;
  if (raw.includes("column does not exist")) return true;
  if (raw.includes("invalid `prisma.") && (raw.includes("relation") || raw.includes("column") || raw.includes("table"))) {
    return true;
  }
  if (raw.includes("relation") && raw.includes("does not exist")) return true;
  if (raw.includes("table") && raw.includes("does not exist")) return true;
  return false;
}

function toFailedActionResult(error: unknown, fallbackMessage: string): FailedFilesActionResult {
  const raw = getErrorMessage(error);
  const errorCode = classifyError(raw) as Exclude<FilesActionErrorCode, "LOCAL_SCHEMA_DRIFT"> | undefined;
  return {
    success: false,
    error: sanitizeErrorMessage(error, fallbackMessage),
    errorCode,
  };
}

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
): Promise<ImportStudyWithPdfActionResult> {
  const validation = projectIdSchema.safeParse(projectId);
  if (!validation.success) {
    return {
      success: false,
      error: "Invalid input. Please check your data and try again.",
      errorCode: "VALIDATION",
    };
  }

  try {
    return await withAuth(async ({ userId, workspaceId }) => {
      const id = validation.data;
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new Error("File is required.");
      }

      const scope = { ownerId: userId, workspaceId };
      const imported = await importStudyWithPdf(scope, id, file);
      try {
        if (imported.fileAsset.mimeType === "application/pdf") {
          await enqueueStudyProcessingJob(scope, {
            projectId: id,
            studyId: imported.study.id,
            fileAssetId: imported.fileAsset.id,
            phase: "quick_extract",
            priority: "background",
            requestSource: "auto_import",
          });
          void kickStudyProcessingDispatcher();
        }

        const enrichedStudy = await getStudy(scope, id, imported.study.id);
        return {
          success: true as const,
          data: {
            study: enrichedStudy ?? imported.study,
            fileAsset: imported.fileAsset,
          },
        };
      } catch (error) {
        logServerError("files-action", "post-import ledger processing setup failed", {
          projectId: id,
          studyId: imported.study.id,
          fileAssetId: imported.fileAsset.id,
        }, error);

        if (isLikelyLocalSchemaDrift(error)) {
          return {
            success: false as const,
            error: LOCAL_SCHEMA_DRIFT_MESSAGE,
            errorCode: LOCAL_SCHEMA_DRIFT_ERROR_CODE,
          };
        }

        return toFailedActionResult(error, POST_IMPORT_FAILURE_MESSAGE);
      }
    });
  } catch (error) {
    logServerError("files-action", "import study with pdf failed", {
      projectId: validation.data,
    }, error);
    return toFailedActionResult(error, "Something went wrong. Please try again.");
  }
}

export async function uploadChatAttachmentAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<{
  fileAssetId: string;
  filename: string;
  size: number;
  mimeType: string;
  extraction: PendingAttachmentExtraction;
  publicUrl?: string;
}>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(async ({ userId, workspaceId }) => {
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new Error("File is required.");
      }
      const { fileAsset, extraction } = await uploadChatAttachment(
        { ownerId: userId, workspaceId }, id, file
      );
      return {
        fileAssetId: fileAsset.id,
        filename: fileAsset.filename,
        size: fileAsset.size,
        mimeType: fileAsset.mimeType,
        extraction,
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
): Promise<ActionResult<{
  fileAssetId: string;
  filename: string;
  size: number;
  mimeType: string;
  extraction: PendingAttachmentExtraction;
}>> {
  return withValidatedAction(extractTextFromExistingFileInput, { projectId, fileAssetId },
    (v) => withAuth(async ({ userId, workspaceId }) => {
      const { fileAsset, extraction } = await extractTextFromExistingFile(
        { ownerId: userId, workspaceId }, v.projectId, v.fileAssetId
      );
      return {
        fileAssetId: fileAsset.id,
        filename: fileAsset.filename,
        size: fileAsset.size,
        mimeType: fileAsset.mimeType,
        extraction,
      };
    }),
  );
}
