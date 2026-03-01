import { z } from "zod";

export const copilotPanelStateSchema = z.object({
    width: z.number(),
    collapsed: z.boolean(),
});

export const copilotMessageSchema = z.object({
    id: z.string(),
    sender: z.enum(["user", "ai"]),
    text: z.string(),
    reasoning: z
        .object({
            text: z.string(),
            state: z.enum(["streaming", "done"]).optional(),
            truncated: z.boolean().optional(),
        })
        .optional(),
    createdAt: z.string(),
    context: z
        .object({
            page: z.enum(["draft", "protocol", "ledger", "study", "overview", "notes", "memory", "ai"]),
            section: z.string().optional(),
        })
        .optional(),
    attachments: z
        .array(
            z.object({
                fileAssetId: z.string(),
                filename: z.string(),
                size: z.number(),
                mimeType: z.string(),
                isExisting: z.boolean().optional(),
            }),
        )
        .optional(),
    artifact: z
        .object({
            id: z.string(),
            type: z.string(),
            status: z.string(),
            title: z.string(),
            payload: z.record(z.string(), z.unknown()),
            version: z.number(),
        })
        .optional(),
});

export const projectCopilotStateSchema = z.object({
    version: z.literal(1),
    panel: copilotPanelStateSchema,
    messages: z.array(copilotMessageSchema),
});
