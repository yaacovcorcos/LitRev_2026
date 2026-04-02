import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import { deepAnalyzeStudyFromPdf, extractStudyFromPdf } from "@/lib/server/pdf-extraction";

const inputSchema = z.object({
    studyId: z.string().optional(),
    deep: z.boolean().optional().default(false),
});

const previewPatchSchema = z.object({
    abstract: z.string().nullable().optional(),
    aiSummary: z.string().nullable().optional(),
    doi: z.string().nullable().optional(),
    pmid: z.string().nullable().optional(),
    journal: z.string().nullable().optional(),
    keywords: z.array(z.string()).optional(),
    sourceUrl: z.string().nullable().optional(),
});

const riskyPatchSchema = z.object({
    title: z.string().optional(),
    authors: z.string().optional(),
    year: z.number().optional(),
    quality: z.enum(["High", "Medium", "Low"]).optional(),
    studyType: z.string().nullable().optional(),
    qualityRationale: z.string().nullable().optional(),
});

const outputSchema = z.object({
    success: z.boolean(),
    classification: z.enum(["safe_only", "mixed_or_risky", "none"]),
    safeUpdates: previewPatchSchema,
    riskyUpdates: riskyPatchSchema,
    extractedFields: z.array(z.string()),
    note: z.string().optional(),
});

function normalizeOptionalString(value: unknown): string | null | undefined {
    if (typeof value === "undefined") return undefined;
    if (value == null) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
}

function uniqueStrings(values: unknown): string[] | undefined {
    if (!Array.isArray(values)) return undefined;
    const normalized = values
        .map((value) => String(value).trim())
        .filter(Boolean);
    return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

export const previewStudyPdfUpdateTool: AITool = {
    definition: {
        name: "preview_study_pdf_update",
        description:
            "Preview candidate study updates from the current study PDF without mutating the study. Use this first when the user wants to fill or insert study-page fields from the paper or PDF. If the preview returns only safeUpdates, follow with update_study_direct. If it returns riskyUpdates or mixed updates, follow with update_study so the user reviews one proposal.",
        parameters: {
            type: "object",
            properties: {
                studyId: {
                    type: "string",
                    description: "Optional study ID. Defaults to the study the user is currently viewing.",
                },
                deep: {
                    type: "boolean",
                    description: "If true, run deep PDF analysis before previewing candidate updates.",
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
            const study = await prisma.study.findFirst({
                where: { id: studyId, projectId },
                select: { id: true, title: true, authors: true, year: true, details: true },
            });

            if (!study) {
                return { callId: "", result: null, error: `Study not found: ${studyId}` };
            }

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

            const details = (study.details as Record<string, unknown>) ?? {};
            const result = deep
                ? await deepAnalyzeStudyFromPdf(
                    file,
                    { title: study.title, authors: study.authors, details },
                    projectId
                )
                : await extractStudyFromPdf(file, projectId);

            if (!result.success) {
                return { callId: "", result: null, error: result.error || "PDF preview failed" };
            }

            const extractedTitle = !deep && "title" in result && typeof result.title === "string"
                ? result.title.trim()
                : undefined;
            const extractedAuthors = !deep && "authors" in result && typeof result.authors === "string"
                ? result.authors.trim()
                : undefined;
            const extractedYear = !deep && "year" in result && typeof result.year === "number"
                ? result.year
                : undefined;

            const safeUpdates = {
                abstract: normalizeOptionalString(result.details?.abstract),
                aiSummary: normalizeOptionalString(result.details?.aiSummary),
                doi: normalizeOptionalString(result.details?.doi),
                pmid: normalizeOptionalString(result.details?.pmid),
                journal: normalizeOptionalString(result.details?.journal),
                keywords: uniqueStrings(result.details?.keywords),
                sourceUrl: normalizeOptionalString(result.details?.sourceUrl),
            };

            const riskyUpdates = {
                title: extractedTitle || undefined,
                authors: extractedAuthors || undefined,
                year: extractedYear,
                quality: "quality" in result && typeof result.quality === "string" ? result.quality : undefined,
                studyType: normalizeOptionalString(result.details?.studyType),
                qualityRationale: normalizeOptionalString(result.details?.qualityRationale),
            };

            const hasSafe = Object.values(safeUpdates).some((value) =>
                Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null
            );
            const hasRisky = Object.values(riskyUpdates).some((value) =>
                value !== undefined && value !== null
            );

            const classification = hasRisky
                ? "mixed_or_risky"
                : hasSafe
                    ? "safe_only"
                    : "none";

            const note = classification === "mixed_or_risky"
                ? "The PDF preview includes risky or mixed fields. Use update_study so the user reviews one proposal."
                : classification === "safe_only"
                    ? "The PDF preview contains only safe fields and can be applied with update_study_direct."
                    : "The PDF preview did not find candidate fields to update.";

            return {
                callId: "",
                result: {
                    success: true,
                    classification,
                    safeUpdates,
                    riskyUpdates,
                    extractedFields: [
                        ...Object.keys(safeUpdates).filter((key) => {
                            const value = safeUpdates[key as keyof typeof safeUpdates];
                            return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
                        }),
                        ...Object.keys(riskyUpdates).filter((key) => {
                            const value = riskyUpdates[key as keyof typeof riskyUpdates];
                            return value !== undefined && value !== null;
                        }),
                    ],
                    note,
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "PDF preview failed",
            };
        }
    },
};
