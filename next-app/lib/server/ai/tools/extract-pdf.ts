import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import { extractStudyFromPdf, deepAnalyzeStudyFromPdf } from "@/lib/server/pdf-extraction";
import { createMemoriesFromDeepAnalysis } from "@/lib/server/memory/study-memory";
import { logServerError } from "@/lib/server/logging";
import { mergeDetails } from "@/lib/utils/merge";

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
            "Extract metadata and content from a study's uploaded PDF. Runs regex extraction + AI analysis to pull title, authors, year, abstract, DOI, and other fields. Set deep=true for full analysis (study type, quality, keywords). Idempotent. Use the study ID from [STUDY_CONTEXT] or [LEDGER_CONTEXT] — do not ask the user for it.",
        parameters: {
            type: "object",
            properties: {
                studyId: {
                    type: "string",
                    description: "The study ID. If omitted, defaults to the study the user is currently viewing.",
                },
                deep: {
                    type: "boolean",
                    description: "If true, run deep analysis (study type, quality, keywords) in addition to basic extraction. Default: false.",
                },
            },
            required: [],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 3,
        allowedRange: [2, 4],
    },

    prerequisites: {
        required: ["project_required", "study_required"],
        blockedHint: "stop_with_explanation",
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const studyId = (args.studyId ?? context?.studyId) as string | undefined;
        const projectId = (context?.projectId ?? args.projectId) as string | undefined;
        const deep = (args.deep as boolean) ?? false;

        if (!studyId) {
            return { callId: "", result: null, error: "No study specified and no study in current view" };
        }
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }

        try {
            // Find the study and its PDF file
            const study = await prisma.study.findFirst({
                where: { id: studyId, projectId },
                select: { id: true, title: true, authors: true, year: true, details: true },
            });

            if (!study) {
                return { callId: "", result: null, error: `Study not found: ${studyId}` };
            }

            const details = (study.details as Record<string, unknown>) ?? {};

            const activePhase = deep ? "deep_analysis" : "quick_extract";
            const activeJob = await prisma.studyProcessingJob.findUnique({
                where: {
                    studyId_phase: {
                        studyId,
                        phase: activePhase,
                    },
                },
                select: {
                    state: true,
                },
            });
            if (activeJob && (activeJob.state === "queued" || activeJob.state === "running")) {
                return {
                    callId: "",
                    result: null,
                    error: deep
                        ? "Deep analysis is already running for this study."
                        : "Extraction is already running for this study.",
                };
            }

            // Idempotency: skip if already extracted (unless deep is requested and not done)
            if (details.source === "pdf-import" && !deep) {
                return {
                    callId: "",
                    result: {
                        success: true,
                        title: study.title,
                        authors: study.authors,
                        year: study.year,
                        extractedFields: Object.keys(details).filter((k) => details[k] != null),
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
                        extractedFields: Object.keys(details).filter((k) => details[k] != null),
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
                return { callId: "", result: null, error: "No PDF file found for this study" };
            }

            if (deep) {
                // Deep analysis
                const result = await deepAnalyzeStudyFromPdf(
                    file,
                    { title: study.title, authors: study.authors, details: details as Record<string, unknown> },
                    projectId
                );

                if (!result.success) {
                    return { callId: "", result: null, error: result.error || "Deep analysis failed" };
                }

                // Merge deep analysis results into study
                const mergedDetails = mergeDetails(details, {
                    ...result.details,
                    deepAnalysisComplete: true,
                });
                await prisma.study.update({
                    where: { id: studyId },
                    data: {
                        ...(result.quality ? { quality: result.quality } : {}),
                        details: mergedDetails as object,
                    },
                });

                // Create StudyMemory records from deep analysis
                await createMemoriesFromDeepAnalysis(
                    studyId,
                    projectId,
                    mergedDetails as Record<string, unknown>,
                    result.quality
                ).catch((err) => {
                    logServerError("extract-pdf-tool", "failed to create study memories from deep analysis", {
                        projectId,
                        studyId,
                    }, err);
                });

                return {
                    callId: "",
                    result: {
                        success: true,
                        title: study.title,
                        authors: study.authors,
                        year: study.year,
                        extractedFields: Object.keys(mergedDetails).filter((k) => (mergedDetails as Record<string, unknown>)[k] != null),
                    },
                };
            } else {
                // Quick extraction
                const result = await extractStudyFromPdf(file, projectId);


                if (!result.success) {
                    return { callId: "", result: null, error: result.error || "Extraction failed" };
                }

                // Update study with extracted data
                const mergedDetails = mergeDetails(details, {
                    ...result.details,
                    source: "pdf-import",
                });
                await prisma.study.update({
                    where: { id: studyId },
                    data: {
                        ...(result.title ? { title: result.title } : {}),
                        ...(result.authors ? { authors: result.authors } : {}),
                        ...(result.year ? { year: result.year } : {}),
                        status: "extracted",
                        details: mergedDetails as object,
                    },
                });

                return {
                    callId: "",
                    result: {
                        success: true,
                        title: result.title || study.title,
                        authors: result.authors || study.authors,
                        year: result.year || study.year,
                        extractedFields: Object.keys(mergedDetails).filter((k) => (mergedDetails as Record<string, unknown>)[k] != null),
                    },
                };
            }
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "PDF extraction failed",
            };
        }
    },
};
