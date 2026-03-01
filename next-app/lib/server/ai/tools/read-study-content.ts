import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import { fetchPdfFromStorage, extractTextFromPdf } from "@/lib/server/pdf-extraction";
import { extractFulltextWithGrobid, type GrobidSectionKey } from "@/lib/server/grobid";

const MAX_RETURN_CHARS = 12000; // ~3k tokens — fits in context without overwhelming

const inputSchema = z.object({
    studyId: z.string().optional(),
    section: z
        .enum(["abstract", "introduction", "methods", "results", "discussion", "conclusion", "full"])
        .optional()
        .default("full"),
});

const outputSchema = z.object({
    studyId: z.string(),
    title: z.string(),
    section: z.string(),
    content: z.string(),
    truncated: z.boolean(),
});

/**
 * Heuristic section extraction from raw PDF text.
 * Looks for common academic section headings and returns the text between them.
 */
type SectionExtractionResult = {
    content: string;
    found: boolean;
};

function extractSectionFromRawText(text: string, section: string): SectionExtractionResult {
    if (section === "full") return { content: text, found: true };

    // For abstract, also try the structured [Abstract] marker
    if (section === "abstract") {
        const abstractMatch = text.match(
            /(?:^|\n)\s*(?:abstract|summary)\s*\n([\s\S]*?)(?:\n\s*(?:introduction|background|keywords|key\s*words|1\s*[.\s])\s*\n|$)/i
        );
        if (abstractMatch) return { content: abstractMatch[1].trim(), found: true };
    }

    // Generic heading-based extraction
    const headingPattern = new RegExp(
        `(?:^|\\n)\\s*(?:\\d+\\.?\\s*)?${section}\\s*\\n([\\s\\S]*?)(?:\\n\\s*(?:\\d+\\.?\\s*)?(?:introduction|background|methods|methodology|materials|results|findings|discussion|conclusion|references|acknowledgment|appendix)\\s*\\n|$)`,
        "i"
    );
    const match = text.match(headingPattern);
    if (match) return { content: match[1].trim(), found: true };

    return {
        content: `[Section "${section}" not found in document. Returning full text.]\n\n${text}`,
        found: false,
    };
}

function isWeakRawText(text: string): boolean {
    return !text || text.length < 1000;
}

export const readStudyContentTool: AITool = {
    definition: {
        name: "read_study_content",
        description:
            "Read the full text or a specific section of a study's uploaded PDF. Use the study ID from [STUDY_CONTEXT] or [LEDGER_CONTEXT] — do not ask the user for it.",
        parameters: {
            type: "object",
            properties: {
                studyId: {
                    type: "string",
                    description: "The study ID. If omitted, defaults to the study the user is currently viewing.",
                },
                section: {
                    type: "string",
                    enum: ["abstract", "introduction", "methods", "results", "discussion", "conclusion", "full"],
                    description:
                        "Which section to extract. Defaults to 'full'. Use a specific section to get focused content within token limits.",
                },
            },
            required: [],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 4,
        allowedRange: [3, 4],
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const studyId = (args.studyId ?? context?.studyId) as string | undefined;
        const projectId = (context?.projectId ?? args.projectId) as string | undefined;
        const section = (args.section as string) ?? "full";

        if (!studyId) {
            return { callId: "", result: null, error: "No study specified and no study in current view" };
        }
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }

        try {
            // Find the study
            const study = await prisma.study.findFirst({
                where: { id: studyId, projectId },
                select: { id: true, title: true },
            });

            if (!study) {
                return { callId: "", result: null, error: `Study not found: ${studyId}` };
            }

            // Find the associated PDF
            const file = await prisma.fileAsset.findFirst({
                where: { studyId, mimeType: "application/pdf" },
                select: { storagePath: true },
                orderBy: { createdAt: "desc" },
            });

            if (!file) {
                return { callId: "", result: null, error: "No PDF file found for this study" };
            }

            // Fetch and parse PDF
            const buffer = await fetchPdfFromStorage(file.storagePath);
            const grobidPromise = extractFulltextWithGrobid(buffer).catch((error) => {
                console.warn("[read_study_content] GROBID fulltext extraction failed", error);
                return null;
            });

            let fullText = "";
            let rawParseError: Error | null = null;
            try {
                fullText = await extractTextFromPdf(buffer);
            } catch (error) {
                rawParseError = error instanceof Error ? error : new Error("Failed to parse PDF");
            }

            const grobidResult = await grobidPromise;
            if (!fullText && !grobidResult) {
                if (rawParseError) throw rawParseError;
                throw new Error("Failed to extract content from PDF");
            }

            // Extract requested section
            let content = "";
            if (section === "full") {
                content = isWeakRawText(fullText) && grobidResult?.fullText ? grobidResult.fullText : fullText;
                if (!content) content = grobidResult?.fullText ?? "";
            } else {
                const rawResult = fullText ? extractSectionFromRawText(fullText, section) : null;
                const shouldPreferGrobid = !rawResult || !rawResult.found || isWeakRawText(fullText);
                const grobidSection = grobidResult?.sections[section as GrobidSectionKey];

                if (shouldPreferGrobid && grobidSection) {
                    content = grobidSection;
                } else if (rawResult) {
                    content = rawResult.content;
                } else if (grobidSection) {
                    content = grobidSection;
                } else if (fullText) {
                    content = `[Section "${section}" not found in document. Returning full text.]\n\n${fullText}`;
                } else {
                    content = `[Section "${section}" not found in structured extraction. Returning full text.]\n\n${grobidResult?.fullText ?? ""}`;
                }
            }

            const truncated = content.length > MAX_RETURN_CHARS;
            if (truncated) {
                content = content.slice(0, MAX_RETURN_CHARS) + "\n\n[...truncated]";
            }

            return {
                callId: "",
                result: {
                    studyId,
                    title: study.title,
                    section,
                    content,
                    truncated,
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to read study content",
            };
        }
    },
};
