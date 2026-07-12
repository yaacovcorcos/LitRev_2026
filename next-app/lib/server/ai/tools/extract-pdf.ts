import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import {
  extractStudyFromPdf,
  deepAnalyzeStudyFromPdf,
} from "@/lib/server/pdf-extraction";
import { createMemoriesFromDeepAnalysis } from "@/lib/server/memory/study-memory";
import { logServerError } from "@/lib/server/logging";
import { mergeDetails } from "@/lib/utils/merge";
import { isAbortLikeError, throwIfAborted } from "@/lib/abort";

const FOREGROUND_EXTRACTION_LEASE_MS = 10 * 60 * 1000;

type ExtractionLease = {
  jobId: string;
  startedAt: Date;
};

function isPrismaUniqueConflict(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "P2002",
  );
}

async function claimExtractionLease(params: {
  studyId: string;
  projectId: string;
  fileAssetId: string;
  phase: string;
}): Promise<ExtractionLease | null> {
  const startedAt = new Date();
  const leaseExpiresAt = new Date(
    startedAt.getTime() + FOREGROUND_EXTRACTION_LEASE_MS,
  );
  try {
    const created = await prisma.studyProcessingJob.create({
      data: {
        studyId: params.studyId,
        projectId: params.projectId,
        fileAssetId: params.fileAssetId,
        phase: params.phase,
        state: "running",
        priority: "foreground",
        requestSource: "agent_tool",
        attemptCount: 1,
        requestedAt: startedAt,
        startedAt,
        leaseExpiresAt,
      },
      select: { id: true },
    });
    return { jobId: created.id, startedAt };
  } catch (error) {
    if (!isPrismaUniqueConflict(error)) throw error;
  }

  const claimed = await prisma.studyProcessingJob.updateMany({
    where: {
      studyId: params.studyId,
      phase: params.phase,
      OR: [
        { state: { notIn: ["queued", "running"] } },
        { state: "running", leaseExpiresAt: { lt: startedAt } },
      ],
    },
    data: {
      projectId: params.projectId,
      fileAssetId: params.fileAssetId,
      state: "running",
      priority: "foreground",
      requestSource: "agent_tool",
      attemptCount: { increment: 1 },
      requestedAt: startedAt,
      startedAt,
      leaseExpiresAt,
      completedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (claimed.count !== 1) return null;

  const row = await prisma.studyProcessingJob.findUnique({
    where: { studyId_phase: { studyId: params.studyId, phase: params.phase } },
    select: { id: true, startedAt: true },
  });
  if (!row?.startedAt || row.startedAt.getTime() !== startedAt.getTime())
    return null;
  return { jobId: row.id, startedAt };
}

async function persistExtractionSuccess(
    lease: ExtractionLease,
    studyId: string,
    data: Prisma.StudyUpdateInput,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const settled = await tx.studyProcessingJob.updateMany({
            where: { id: lease.jobId, state: "running", startedAt: lease.startedAt },
            data: {
                state: "succeeded",
                completedAt: new Date(),
                leaseExpiresAt: null,
                lastErrorCode: null,
                lastErrorMessage: null,
            },
        });
        if (settled.count !== 1) {
            throw new Error("PDF extraction lease was lost before the study update.");
        }
        await tx.study.update({ where: { id: studyId }, data });
    });
}

async function settleFailedExtractionLease(lease: ExtractionLease): Promise<void> {
  const settled = await prisma.studyProcessingJob.updateMany({
    where: { id: lease.jobId, state: "running", startedAt: lease.startedAt },
    data: {
      state: "failed",
      completedAt: new Date(),
      leaseExpiresAt: null,
      lastErrorCode: "AGENT_EXTRACTION_FAILED",
      lastErrorMessage: "Agent PDF extraction did not complete successfully.",
    },
  });
  if (settled.count !== 1) {
    throw new Error("PDF extraction lease was lost before job finalization.");
  }
}

const inputSchema = z.object({
    studyId: z.string().optional(),
    deep: z.boolean().optional().default(false),
});

const outputSchema = z.object({
    success: z.boolean(),
    title: z.string().optional(),
    authors: z.string().optional(),
    year: z.number().optional(),
    extractedFields: z.array(z.string()),
});

export const extractPdfTool: AITool = {
    definition: {
        name: "extract_pdf",
        description:
      "Extract metadata and content from a study's uploaded PDF, then persist the extracted study fields. Set deep=true for full analysis. This is a direct mutation and is available only at autonomy level 3 or 4; it is not a review-first preview. Use preview_study_pdf_update when review is required.",
        parameters: {
            type: "object",
            properties: {
                studyId: {
                    type: "string",
          description:
            "The study ID. If omitted, defaults to the study the user is currently viewing.",
                },
                deep: {
                    type: "boolean",
          description:
            "If true, run deep analysis (study type, quality, keywords) in addition to basic extraction. Default: false.",
                },
            },
            required: [],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 3,
    allowedRange: [3, 4],
    },

    prerequisites: {
        required: ["project_required", "study_required"],
        blockedHint: "stop_with_explanation",
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const studyId = (args.studyId ?? context?.studyId) as string | undefined;
    const projectId = (context?.projectId ?? args.projectId) as
      string | undefined;
        const deep = (args.deep as boolean) ?? false;

        if (!studyId) {
      return {
        callId: "",
        result: null,
        error: "No study specified and no study in current view",
      };
        }
        if (!projectId) {
      return {
        callId: "",
        result: null,
        error: "No project context available",
      };
        }

        try {
      throwIfAborted(context?.signal);
            // Find the study and its PDF file
            const study = await prisma.study.findFirst({
                where: { id: studyId, projectId },
                select: {
          id: true,
          title: true,
          authors: true,
          year: true,
          details: true,
                },
            });

      if (!study) {
                return {
                    callId: "",
                    result: null,
          error: `Study not found: ${studyId}`,
                };
            }

      const details = (study.details as Record<string, unknown>) ?? {};

            // Idempotency: skip if already extracted (unless deep is requested and not done)
            if (details.source === "pdf-import" && !deep) {
                return {
                    callId: "",
                    result: {
                        success: true,
                        title: study.title,
                        authors: study.authors,
                        year: study.year,
            extractedFields: Object.keys(details).filter(
              (k) => details[k] != null,
            ),
                    },
                };
            }
            if (deep && details.deepAnalysisComplete) {
                return {
                    callId: "",
                    result: {
                        success: true,
                        title: study.title,
                        authors: study.authors,
                        year: study.year,
            extractedFields: Object.keys(details).filter(
              (k) => details[k] != null,
            ),
                    },
                };
            }

            // Find the associated PDF FileAsset
            const file = await prisma.fileAsset.findFirst({
                where: { studyId, projectId, mimeType: "application/pdf" },
                select: {
                    id: true,
                    projectId: true,
                    studyId: true,
                    kind: true,
                    filename: true,
                    mimeType: true,
                    storagePath: true,
                    publicUrl: true,
                },
                orderBy: { createdAt: "desc" },
            });

            if (!file) {
        return {
          callId: "",
          result: null,
          error: "No PDF file found for this study",
        };
            }

      throwIfAborted(context?.signal);
      const lease = await claimExtractionLease({
        studyId,
        projectId,
        fileAssetId: file.id,
        phase: deep ? "deep_analysis" : "quick_extract",
      });
      if (!lease) {
        return {
          callId: "",
          result: null,
          error: deep
            ? "Deep analysis is already running for this study."
            : "Extraction is already running for this study.",
        };
      }

      let extractionSucceeded = false;
      let extractionError: unknown;
      try {
        throwIfAborted(context?.signal);
            if (deep) {
                // Deep analysis
                const result = await deepAnalyzeStudyFromPdf(
                    file,
            {
              title: study.title,
              authors: study.authors,
              details: details as Record<string, unknown>,
            },
            projectId,
            { signal: context?.signal },
                );

                if (!result.success) {
            return {
              callId: "",
              result: null,
              error: result.error || "Deep analysis failed",
            };
                }

                // Merge deep analysis results into study
          const mergedDetails = mergeDetails(details, {
            ...result.details,
            deepAnalysisComplete: true,
          });
          throwIfAborted(context?.signal);
          await persistExtractionSuccess(lease, studyId, {
            ...(result.quality ? { quality: result.quality } : {}),
            details: mergedDetails as object,
          });
          extractionSucceeded = true;

                // Create StudyMemory records from deep analysis
                await createMemoriesFromDeepAnalysis(
                    studyId,
                    projectId,
                    mergedDetails as Record<string, unknown>,
            result.quality,
                ).catch((err) => {
            logServerError(
              "extract-pdf-tool",
              "failed to create study memories from deep analysis",
              {
                        projectId,
                        studyId,
              },
              err,
            );
                });

                return {
                    callId: "",
                    result: {
                        success: true,
                        title: study.title,
                        authors: study.authors,
                        year: study.year,
              extractedFields: Object.keys(mergedDetails).filter(
                (k) => (mergedDetails as Record<string, unknown>)[k] != null,
              ),
                    },
                };
            } else {
                // Quick extraction
          const result = await extractStudyFromPdf(file, projectId, {
            signal: context?.signal,
          });

                if (!result.success) {
            return {
              callId: "",
              result: null,
              error: result.error || "Extraction failed",
            };
                }

                // Update study with extracted data
          const mergedDetails = mergeDetails(details, {
            ...result.details,
            source: "pdf-import",
          });
          throwIfAborted(context?.signal);
          await persistExtractionSuccess(lease, studyId, {
            ...(result.title ? { title: result.title } : {}),
            ...(result.authors ? { authors: result.authors } : {}),
            ...(result.year ? { year: result.year } : {}),
            status: "extracted",
            details: mergedDetails as object,
          });

          extractionSucceeded = true;
                return {
                    callId: "",
                    result: {
                        success: true,
                        title: result.title || study.title,
                        authors: result.authors || study.authors,
                        year: result.year || study.year,
              extractedFields: Object.keys(mergedDetails).filter(
                (k) => (mergedDetails as Record<string, unknown>)[k] != null,
              ),
                    },
                };
            }
        } catch (error) {
        extractionError = error;
        throw error;
      } finally {
        if (!extractionSucceeded) {
          try {
            await settleFailedExtractionLease(lease);
          } catch (settlementError) {
            logServerError(
              "extract-pdf-tool",
              "failed to settle PDF extraction lease",
              {
                projectId,
                studyId,
                jobId: lease.jobId,
                extractionSucceeded,
              },
              settlementError,
            );
            if (!extractionError) {
              throw settlementError;
            }
          }
        }
      }
    } catch (error) {
      if (context?.signal?.aborted || isAbortLikeError(error)) {
        throw error;
      }
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "PDF extraction failed",
            };
        }
    },
};
