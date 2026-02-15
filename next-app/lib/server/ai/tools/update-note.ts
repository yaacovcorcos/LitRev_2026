import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { listNotes, extractTextFromContent, type NoteContent } from "@/lib/server/notes";

const inputSchema = z.object({
    section: z.string().min(1, "section is required"),
    content: z.string().min(1, "content is required"),
    action: z.enum(["replace", "append", "revise"]),
});

/**
 * Output matches DraftDiffSchema so it can be stored as a draft_diff artifact.
 * Persistence happens via the draft_diff apply function when the user accepts.
 */
const outputSchema = z.object({
    section: z.string().min(1),
    content: z.string().min(1),
    citations: z.array(z.object({ studyId: z.string(), label: z.string() })),
    wordCount: z.number().int().nonnegative(),
});

export const updateNoteTool: AITool = {
    definition: {
        name: "update_note",
        description:
            "Create or update a note linked to a review section (e.g., 'Introduction', 'Methods', 'Results', 'Discussion'). Use 'replace' to overwrite the section content, 'append' to add to the end, or 'revise' to rewrite based on the new content. The content should be markdown-formatted academic prose. Returns a proposal for user review — does not auto-apply.",
        parameters: {
            type: "object",
            properties: {
                section: {
                    type: "string",
                    description: "The review section name (e.g., 'Introduction', 'Methods', 'Results', 'Discussion')",
                },
                content: {
                    type: "string",
                    description: "The text content to write (markdown-formatted academic prose)",
                },
                action: {
                    type: "string",
                    enum: ["replace", "append", "revise"],
                    description: "How to apply the content: 'replace' overwrites, 'append' adds to end, 'revise' rewrites the section",
                },
            },
            required: ["section", "content", "action"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 2,
        allowedRange: [1, 2],
        hardCap: 2,
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const projectId = (context?.projectId ?? args.projectId) as string;
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }
        const section = args.section as string;
        const content = args.content as string;
        const action = args.action as "replace" | "append" | "revise";

        try {
            // For append, read existing note to produce the combined text
            let finalContent = content;
            if (action === "append") {
                const existing = await listNotes(projectId, { linkedStudyId: undefined });
                const sectionNote = existing.find(
                    (n) => n.linkedSection?.toLowerCase() === section.toLowerCase()
                );
                if (sectionNote) {
                    const existingText = extractTextFromContent(
                        sectionNote.content as NoteContent
                    );
                    if (existingText) {
                        finalContent = `${existingText}\n\n${content}`;
                    }
                }
            }

            const wordCount = finalContent.split(/\s+/).filter(Boolean).length;

            // Return proposal payload — does NOT persist.
            // Persistence happens via the draft_diff apply function
            // when the user accepts the artifact.
            return {
                callId: "",
                result: {
                    section,
                    content: finalContent,
                    citations: [],
                    wordCount,
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to prepare draft",
            };
        }
    },
};
