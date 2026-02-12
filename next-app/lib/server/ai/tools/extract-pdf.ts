import { z } from "zod";
import type { AITool } from "./base";
import { prisma } from "@/lib/server/prisma";
import { extractStudyFromPdf, deepAnalyzeStudyFromPdf } from "@/lib/server/pdf-extraction";
import { createMemoriesFromDeepAnalysis } from "@/lib/server/memory/study-memory";

const inputSchema = z.object({
    studyId: z.string().min(1, "studyId is required"),
    projectId: z.string().min(1, "projectId is required"),
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
            "Extract metadata and content from a study's uploaded PDF. Runs regex extraction + AI analysis to pull title, authors, year, abstract, DOI, and other fields. Set deep=true for full analysis (study type, quality, keywords). Idempotent: skips extraction if the study already has extracted data.",
        parameters: {
            type: "object",
            properties: {
                studyId: {
                    type: "string",
                    description: "The study ID to extract PDF data for",
                },
                projectId: {
                    type: "string",
                    description: "The project ID the study belongs to",
                },
                deep: {
                    type: "boolean",
                    description: "If true, run deep analysis (study type, quality, keywords) in addition to basic extraction. Default: false.",
                },
            },
            required: ["studyId", "projectId"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 3,
        allowedRange: [2, 4],
    },

    async execute(args: Record<string, unknown>) {
        const studyId = args.studyId as string;
        const projectId = args.projectId as string;
        const deep = (args.deep as boolean) ?? false;

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
                where: { studyId, mimeType: "application/pdf" },
                select: { storagePath: true },
                orderBy: { createdAt: "desc" },
            });

            if (!file) {
                return { callId: "", result: null, error: "No PDF file found for this study" };
            }

            if (deep) {
                // Deep analysis
                const result = await deepAnalyzeStudyFromPdf(
                    file.storagePath,
                    { title: study.title, authors: study.authors, details: details as Record<string, unknown> },
                    projectId
                );

                if (!result.success) {
                    return { callId: "", result: null, error: result.error || "Deep analysis failed" };
                }

                // Merge deep analysis results into study
                const mergedDetails = { ...details, ...result.details };
                await prisma.study.update({
                    where: { id: studyId },
                    data: {
                        ...(result.quality ? { quality: result.quality.toLowerCase() } : {}),
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
                    console.error("Failed to create study memories from deep analysis:", err);
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
                const result = await extractStudyFromPdf(file.storagePath, projectId);

                if (!result.success) {
                    return { callId: "", result: null, error: result.error || "Extraction failed" };
                }

                // Update study with extracted data
                const mergedDetails = { ...details, ...result.details };
                await prisma.study.update({
                    where: { id: studyId },
                    data: {
                        ...(result.title ? { title: result.title } : {}),
                        ...(result.authors ? { authors: result.authors } : {}),
                        ...(result.year ? { year: result.year } : {}),
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
