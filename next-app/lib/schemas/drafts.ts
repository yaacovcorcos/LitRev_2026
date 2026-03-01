import { z } from "zod";

/** Recursive JSONContent (TipTap editor content) */
export const jsonContentSchema: z.ZodType<unknown> = z.lazy(() =>
    z.object({
        type: z.string().optional(),
        attrs: z.record(z.string(), z.unknown()).optional(),
        content: z.array(jsonContentSchema).optional(),
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

export const draftSectionFormatSchema = z.object({
    fontSize: z.number(),
    lineHeight: z.number(),
    paragraphSpacing: z.number(),
    fontFamily: z.string(),
});

export const draftPanelsStateSchema = z.object({
    ledgerWidth: z.number(),
    copilotWidth: z.number(),
    ledgerCollapsed: z.boolean(),
    copilotCollapsed: z.boolean(),
});

export const draftStateSchema = z.object({
    version: z.literal(1),
    mode: z.enum(["section", "full"]),
    activeSection: z.string(),
    sectionOrder: z.array(z.string()),
    customSections: z.record(
        z.string(),
        z.object({
            label: z.string(),
            placeholder: z.string().optional(),
        }),
    ),
    formattingBySection: z.record(z.string(), draftSectionFormatSchema),
    panels: draftPanelsStateSchema,
    contentBySection: z.record(z.string(), jsonContentSchema),
    ledgerBySection: z.record(z.string(), z.array(z.string())),
    copilotBySection: z.record(z.string(), z.array(z.unknown())),
});
