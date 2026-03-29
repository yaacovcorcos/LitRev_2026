"use server";

import { z } from "zod";
import { assertProjectAccess } from "@/lib/server/access";
import { getFileAssetById } from "@/lib/server/files";
import { sanitizeErrorMessage } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { logServerError } from "@/lib/server/logging";
import {
  enqueueStudyProcessingJob,
  kickStudyProcessingDispatcher,
  listStudyProcessingStateItems,
  prioritizeStudyProcessingJob,
  type StudyProcessingStateItem,
  type StudyProcessingTransitionHint,
} from "@/lib/server/study-processing";
import type { Study, StudyProcessingPhase, StudyProcessingSnapshot } from "@/types/ledger";
import { projectIdSchema, resourceIdSchema, studyIdSchema } from "@/lib/schemas/ids";

const extractionInputSchema = z.object({
  projectId: projectIdSchema,
  studyId: studyIdSchema,
  fileAssetId: resourceIdSchema,
});

const processingStateListInputSchema = z.object({
  projectId: projectIdSchema,
  studyIds: z.array(studyIdSchema),
});

const processingPriorityInputSchema = z.object({
  projectId: projectIdSchema,
  studyId: studyIdSchema,
  phase: z.enum(["quick_extract", "deep_analysis"]),
});

export type ExtractionActionResult = {
  success: boolean;
  study?: Study;
  processing?: StudyProcessingSnapshot;
  transitionHint?: StudyProcessingTransitionHint;
  error?: string;
  errorCode?: "ACCESS_DENIED" | "STUDY_NOT_FOUND" | "FILE_NOT_FOUND" | "NOT_PDF" | "VALIDATION";
};

export type DeepAnalysisActionResult = ExtractionActionResult;

async function validatePdfInput(
  projectId: string,
  studyId: string,
  fileAssetId: string,
) {
  return withAuth(async ({ userId, workspaceId }) => {
    const scope = { ownerId: userId, workspaceId };
    await assertProjectAccess(scope, projectId);

    const file = await getFileAssetById(scope, projectId, fileAssetId);
    if (!file) {
      return { ok: false as const, error: "File not found", errorCode: "FILE_NOT_FOUND" as const };
    }

    if (file.studyId !== studyId) {
      return { ok: false as const, error: "File not found", errorCode: "FILE_NOT_FOUND" as const };
    }

    if (file.mimeType !== "application/pdf" && file.format !== "pdf") {
      return { ok: false as const, error: "File is not a PDF", errorCode: "NOT_PDF" as const };
    }

    return { ok: true as const, scope };
  });
}

export async function extractStudyFromPdfAction(
  projectId: string,
  studyId: string,
  fileAssetId: string,
): Promise<ExtractionActionResult> {
  try {
    const v = extractionInputSchema.parse({ projectId, studyId, fileAssetId });
    const validation = await validatePdfInput(v.projectId, v.studyId, v.fileAssetId);
    if (!validation.ok) {
      return {
        success: false,
        error: validation.error,
        errorCode: validation.errorCode,
      };
    }

    const result = await enqueueStudyProcessingJob(validation.scope, {
      projectId: v.projectId,
      studyId: v.studyId,
      fileAssetId: v.fileAssetId,
      phase: "quick_extract",
      priority: "foreground",
      requestSource: "manual_extract",
    });
    void kickStudyProcessingDispatcher();
    return {
      success: true,
      study: result.study,
      processing: result.processing,
      transitionHint: result.transitionHint,
    };
  } catch (err) {
    logServerError("extraction-action", "study extraction enqueue failed", {
      projectId,
      studyId,
      fileAssetId,
    }, err);
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Unable to queue PDF extraction.", { allowRawMessage: true }),
    };
  }
}

export async function deepAnalyzeStudyAction(
  projectId: string,
  studyId: string,
  fileAssetId: string,
): Promise<DeepAnalysisActionResult> {
  try {
    const v = extractionInputSchema.parse({ projectId, studyId, fileAssetId });
    const validation = await validatePdfInput(v.projectId, v.studyId, v.fileAssetId);
    if (!validation.ok) {
      return {
        success: false,
        error: validation.error,
        errorCode: validation.errorCode,
      };
    }

    const result = await enqueueStudyProcessingJob(validation.scope, {
      projectId: v.projectId,
      studyId: v.studyId,
      fileAssetId: v.fileAssetId,
      phase: "deep_analysis",
      priority: "foreground",
      requestSource: "manual_analyze",
    });
    void kickStudyProcessingDispatcher();
    return {
      success: true,
      study: result.study,
      processing: result.processing,
      transitionHint: result.transitionHint,
    };
  } catch (err) {
    logServerError("extraction-action", "deep analysis enqueue failed", {
      projectId,
      studyId,
      fileAssetId,
    }, err);
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Unable to queue deep analysis.", { allowRawMessage: true }),
    };
  }
}

export async function listStudyProcessingStatesAction(
  projectId: string,
  studyIds: string[],
): Promise<{ success: true; data: StudyProcessingStateItem[] } | { success: false; error: string; errorCode?: string }> {
  try {
    const v = processingStateListInputSchema.parse({ projectId, studyIds });
    const data = await withAuth(({ userId, workspaceId }) =>
      listStudyProcessingStateItems({ ownerId: userId, workspaceId }, v.projectId, v.studyIds),
    );
    if (data.some((item) => item.processing.currentState === "queued" || item.processing.currentState === "running")) {
      void kickStudyProcessingDispatcher();
    }
    return { success: true, data };
  } catch (err) {
    logServerError("extraction-action", "list processing states failed", {
      projectId,
      studyIds,
    }, err);
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Unable to load processing state."),
    };
  }
}

export async function prioritizeStudyProcessingAction(
  projectId: string,
  studyId: string,
  phase: StudyProcessingPhase,
): Promise<ExtractionActionResult> {
  try {
    const v = processingPriorityInputSchema.parse({ projectId, studyId, phase });
    const result = await withAuth(({ userId, workspaceId }) =>
      prioritizeStudyProcessingJob(
        { ownerId: userId, workspaceId },
        { projectId: v.projectId, studyId: v.studyId, phase: v.phase },
      ),
    );
    void kickStudyProcessingDispatcher();
    return {
      success: true,
      study: result.study,
      processing: result.processing,
      transitionHint: result.transitionHint,
    };
  } catch (err) {
    logServerError("extraction-action", "prioritize processing failed", {
      projectId,
      studyId,
      phase,
    }, err);
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Unable to prioritize study processing."),
    };
  }
}
