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
        .array(z.union([
            z.object({
                fileAssetId: z.string(),
                filename: z.string(),
                size: z.number(),
                mimeType: z.string(),
                isExisting: z.boolean().optional(),
            }),
            z.object({
                type: z.literal("context_capture"),
                target: z.object({
                    kind: z.enum([
                        "protocol_section",
                        "protocol_field",
                        "protocol_criterion",
                        "draft_selection",
                        "study",
                        "study_set",
                        "note",
                        "note_selection",
                        "artifact",
                        "assistant_message",
                    ]),
                    projectId: z.string(),
                    label: z.string(),
                    icon: z.string(),
                    preview: z.string().optional(),
                }).passthrough(),
            }),
        ]))
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
    checkpoint: z
        .object({
            label: z.string(),
        })
        .optional(),
    toolActivity: z
        .object({
            callId: z.string(),
            toolName: z.string(),
            status: z.enum(["queued", "running", "done", "failed", "interrupted"]),
            displayLabel: z.string().optional(),
            inputPreview: z.string().optional(),
            outcomeSummary: z.string().optional(),
            sourceBadge: z.string().optional(),
            detailItems: z.array(z.string()).optional(),
            summary: z.string().optional(),
            queryPreview: z.string().optional(),
            returnedCount: z.number().optional(),
            totalResults: z.number().optional(),
            resultIdentifiers: z.array(z.string()).optional(),
            errorMeta: z.record(z.string(), z.unknown()).optional(),
            startedAt: z.string(),
            updatedAt: z.string(),
            completedAt: z.string().optional(),
        })
        .optional(),
});

export const projectCopilotStateSchema = z.object({
    version: z.literal(1),
    panel: copilotPanelStateSchema,
    messages: z.array(copilotMessageSchema),
});
