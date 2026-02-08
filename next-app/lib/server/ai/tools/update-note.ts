import { z } from "zod";
import type { AITool } from "./base";
import { createNote, updateNote, listNotes, textToTipTapDoc, extractTextFromContent, type NoteContent } from "@/lib/server/notes";

const inputSchema = z.object({
    projectId: z.string().min(1, "projectId is required"),
    section: z.string().min(1, "section is required"),
    content: z.string().min(1, "content is required"),
    action: z.enum(["replace", "append", "revise"]),
});

const outputSchema = z.object({
    noteId: z.string(),
    section: z.string(),
    action: z.string(),
    wordCount: z.number(),
});

export const updateNoteTool: AITool = {
    definition: {
        name: "update_note",
        description:
            "Create or update a note linked to a review section (e.g., 'Introduction', 'Methods', 'Results', 'Discussion'). Use 'replace' to overwrite the section content, 'append' to add to the end, or 'revise' to rewrite based on the new content. The content should be markdown-formatted academic prose.",
        parameters: {
            type: "object",
            properties: {
                projectId: {
                    type: "string",
                    description: "The project ID",
                },
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
            required: ["projectId", "section", "content", "action"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 1,
        allowedRange: [1, 2],
        hardCap: 2,
    },

    async execute(args: Record<string, unknown>) {
        const projectId = args.projectId as string;
        const section = args.section as string;
        const content = args.content as string;
        const action = args.action as "replace" | "append" | "revise";

        try {
            // Find existing note for this section
            const existing = await listNotes(projectId, { linkedStudyId: undefined });
            const sectionNote = existing.find(
                (n) => n.linkedSection?.toLowerCase() === section.toLowerCase()
            );

            const wordCount = content.split(/\s+/).filter(Boolean).length;

            if (sectionNote) {
                // Note exists — apply action
                if (action === "replace" || action === "revise") {
                    await updateNote(sectionNote.id, {
                        content: textToTipTapDoc(content),
                    });
                } else if (action === "append") {
                    const existingText = extractTextFromContent(
                        sectionNote.content as NoteContent
                    );
                    const combined = existingText
                        ? `${existingText}\n\n${content}`
                        : content;
                    await updateNote(sectionNote.id, {
                        content: textToTipTapDoc(combined),
                    });
                }

                return {
                    callId: "",
                    result: {
                        noteId: sectionNote.id,
                        section,
                        action,
                        wordCount,
                    },
                };
            } else {
                // Create new note linked to section
                const note = await createNote({
                    projectId,
                    title: section,
                    content: textToTipTapDoc(content),
                    linkedSection: section,
                    source: "conversation",
                    tags: ["draft", section.toLowerCase()],
                });

                return {
                    callId: "",
                    result: {
                        noteId: note.id,
                        section,
                        action: "replace",
                        wordCount,
                    },
                };
            }
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to update note",
            };
        }
    },
};
