import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import { fetchPdfFromStorage, extractTextFromPdf } from "@/lib/server/pdf-extraction";

const MAX_RETURN_CHARS = 12000; // ~3k tokens — fits in context without overwhelming

const inputSchema = z.object({
    studyId: z.string().min(1, "studyId is required"),
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
function extractSection(text: string, section: string): string {
    if (section === "full") return text;

    // For abstract, also try the structured [Abstract] marker
    if (section === "abstract") {
        const abstractMatch = text.match(
            /(?:^|\n)\s*(?:abstract|summary)\s*\n([\s\S]*?)(?:\n\s*(?:introduction|background|keywords|key\s*words|1\s*[.\s])\s*\n|$)/i
        );
        if (abstractMatch) return abstractMatch[1].trim();
    }

    // Generic heading-based extraction
    const headingPattern = new RegExp(
        `(?:^|\\n)\\s*(?:\\d+\\.?\\s*)?${section}\\s*\\n([\\s\\S]*?)(?:\\n\\s*(?:\\d+\\.?\\s*)?(?:introduction|background|methods|methodology|materials|results|findings|discussion|conclusion|references|acknowledgment|appendix)\\s*\\n|$)`,
        "i"
    );
    const match = text.match(headingPattern);
    if (match) return match[1].trim();

    return `[Section "${section}" not found in document. Returning full text.]\n\n${text}`;
}

export const readStudyContentTool: AITool = {
    definition: {
        name: "read_study_content",
        description:
            "Read the full text or a specific section of a study's uploaded PDF. Use this when you need to reference specific passages, verify claims, or analyze content beyond what's in the study snapshot context. Sections: abstract, introduction, methods, results, discussion, conclusion, or full.",
        parameters: {
            type: "object",
            properties: {
                studyId: {
                    type: "string",
                    description: "The study ID to read content from",
                },
                section: {
                    type: "string",
                    enum: ["abstract", "introduction", "methods", "results", "discussion", "conclusion", "full"],
                    description:
                        "Which section to extract. Defaults to 'full'. Use a specific section to get focused content within token limits.",
                },
            },
            required: ["studyId"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 4,
        allowedRange: [3, 4],
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const studyId = args.studyId as string;
        const projectId = (context?.projectId ?? args.projectId) as string;
        const section = (args.section as string) ?? "full";

        try {
            // Find the study
            const study = await prisma.study.findFirst({
                where: { id: studyId, ...(projectId ? { projectId } : {}) },
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
            const fullText = await extractTextFromPdf(buffer);

            // Extract requested section
            let content = extractSection(fullText, section);
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
