import { z } from "zod";
import { cuidSchema, tagsSchema } from "./ids";

/** Recursive NoteContent (TipTap JSONContent-compatible) */
export const noteContentSchema: z.ZodType<{
    type?: string;
    attrs?: Record<string, unknown>;
    content?: unknown[];
    marks?: { type: string; attrs?: Record<string, unknown> }[];
    text?: string;
}> = z.lazy(() =>
    z.object({
        type: z.string().optional(),
        attrs: z.record(z.string(), z.unknown()).optional(),
        content: z.array(noteContentSchema).optional(),
        marks: z
            .array(
                z.object({
                    type: z.string(),
                    attrs: z.record(z.string(), z.unknown()).optional(),
                }),
            )
            .optional(),
        text: z.string().optional(),
    }),
);

export const createNoteInputSchema = z.object({
    projectId: cuidSchema,
    title: z.string().max(500).optional(),
    content: noteContentSchema,
    tags: tagsSchema.optional(),
    linkedStudyId: cuidSchema.optional(),
    linkedSection: z.string().max(200).optional(),
    source: z.enum(["manual", "conversation"]).optional(),
    sourceConversationId: cuidSchema.optional(),
    sourceMessageId: cuidSchema.optional(),
});

export const updateNoteInputSchema = z.object({
    title: z.string().max(500).optional(),
    content: noteContentSchema.optional(),
    tags: tagsSchema.optional(),
    linkedStudyId: cuidSchema.nullable().optional(),
    linkedSection: z.string().max(200).nullable().optional(),
});

export const listNotesOptionsSchema = z.object({
    tags: z.array(z.string()).optional(),
    source: z.enum(["manual", "conversation"]).optional(),
    search: z.string().max(1000).optional(),
    linkedStudyId: cuidSchema.optional(),
});
