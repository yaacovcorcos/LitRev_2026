import { z } from "zod";
import { cuidSchema } from "./ids";

export const copilotPageSchema = z.enum([
    "draft", "protocol", "ledger", "study", "overview", "notes", "memory", "ai",
]);

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);

export const fileMessageAttachmentSchema = z.object({
    fileAssetId: cuidSchema,
    filename: z.string().min(1).max(500),
    mimeType: z.string().min(1).max(200),
    size: z.number().int().nonnegative(),
    isExisting: z.boolean().optional(),
});

const contextCaptureTargetSchema = z.object({
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
    projectId: cuidSchema,
    label: z.string().min(1).max(500),
    icon: z.string().min(1).max(100),
    preview: z.string().max(5_000).optional(),
}).passthrough();

export const messageAttachmentSchema = z.union([
    fileMessageAttachmentSchema,
    z.object({
        type: z.literal("context_capture"),
        target: contextCaptureTargetSchema,
    }),
]);

export const listConversationsParamsSchema = z.object({
    projectId: cuidSchema.optional(),
    studyId: cuidSchema.optional(),
    page: copilotPageSchema.optional(),
    limit: z.number().int().min(1).max(200).optional(),
});

export const getConversationParamsSchema = z.object({
    expectedProjectId: cuidSchema.optional(),
    includeArchived: z.boolean().optional(),
    messageLimit: z.number().int().min(1).max(500).optional(),
});

export const getConversationMessagesParamsSchema = z.object({
    conversationId: cuidSchema,
    limit: z.number().int().min(1).max(500).optional(),
    cursor: z.object({
        createdAt: z.union([z.string(), z.date()]),
        id: cuidSchema,
    }),
    expectedProjectId: cuidSchema.optional(),
    includeArchived: z.boolean().optional(),
});

export const createConversationParamsSchema = z.object({
    projectId: cuidSchema.optional(),
    studyId: cuidSchema.optional(),
    page: copilotPageSchema.optional(),
    context: z.string().max(200).optional(),
    title: z.string().max(500).optional(),
});

export const addMessageParamsSchema = z.object({
    conversationId: cuidSchema,
    role: messageRoleSchema,
    content: z.string().min(1).max(200_000),
    attachments: z.array(messageAttachmentSchema).max(20).optional(),
});

export const branchConversationParamsSchema = z.object({
    conversationId: cuidSchema,
    upToMessageId: cuidSchema.optional(),
    upToCreatedAt: z.string().max(100).optional(),
    title: z.string().max(500).optional(),
});

export const getOrCreateConversationParamsSchema = z.object({
    projectId: cuidSchema.optional(),
    studyId: cuidSchema.optional(),
    page: copilotPageSchema.optional(),
});
