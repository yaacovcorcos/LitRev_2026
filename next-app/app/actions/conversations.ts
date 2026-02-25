"use server";

import { prisma } from "@/lib/server/prisma";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import type { CopilotPage } from "@/types/ai";

// =============================================================================
// MULTI-USER READINESS
// =============================================================================
// When auth is added, replace these with actual user/workspace from session.
// For now, all conversations are scoped by projectId (which has workspaceId).
// The placeholder IDs ensure consistent scoping patterns for smooth migration.
// =============================================================================
const PLACEHOLDER_USER_ID = "single-user";
const PLACEHOLDER_WORKSPACE_ID = "single-workspace";

/**
 * Get the current user context (placeholder until auth is implemented)
 * When auth is added, this will get userId/workspaceId from the session
 */
function getCurrentUserContext() {
    // TODO: Replace with actual auth session lookup
    return {
        userId: PLACEHOLDER_USER_ID,
        workspaceId: PLACEHOLDER_WORKSPACE_ID,
    };
}

export type MessageAttachment = {
    fileAssetId: string;
    filename: string;
    mimeType: string;
    size: number;
    isExisting?: boolean;
};

export type ConversationMessage = {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: MessageAttachment[];
    createdAt: string;
};

export type ConversationSummary = {
    id: string;
    title: string | null;
    context: string;
    page: string | null;
    projectId: string | null;
    studyId: string | null;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
};

export type ConversationWithMessages = ConversationSummary & {
    messages: ConversationMessage[];
    hasMore: boolean;
    artifacts: {
        id: string;
        type: string;
        status: string;
        title: string;
        payload: unknown;
        version: number;
        createdAt: string;
    }[];
};

export type PaginatedMessages = {
    messages: ConversationMessage[];
    hasMore: boolean;
};

export type BranchedConversationResult = ConversationSummary & {
    sourceConversationId: string;
};

/**
 * List all conversations for a given context
 * Multi-user ready: filters by workspaceId when provided
 */
export async function listConversations(params: {
    userId?: string;
    workspaceId?: string;
    projectId?: string;
    studyId?: string;
    page?: CopilotPage;
    limit?: number;
}): Promise<ActionResult<ConversationSummary[]>> {
    return withAction(async () => {
        const { userId, workspaceId, projectId, studyId, page, limit = 50 } = params;

        const conversations = await prisma.aIConversation.findMany({
            where: {
                userId: userId || undefined,
                workspaceId: workspaceId || undefined,
                projectId: projectId || undefined,
                studyId: studyId || undefined,
                page: page || undefined,
                archived: false,
            },
            include: {
                _count: {
                    select: { messages: true },
                },
            },
            orderBy: { updatedAt: "desc" },
            take: limit,
        });

        return conversations.map((conv) => ({
            id: conv.id,
            title: conv.title,
            context: conv.context,
            page: conv.page,
            projectId: conv.projectId,
            studyId: conv.studyId,
            messageCount: conv._count.messages,
            createdAt: conv.createdAt.toISOString(),
            updatedAt: conv.updatedAt.toISOString(),
        }));
    });
}

const DEFAULT_MESSAGE_LIMIT = 50;

/**
 * Get a single conversation with the latest page of messages.
 * Returns `hasMore: true` if older messages exist beyond the loaded page.
 */
export async function getConversation(
    conversationId: string,
    params?: {
        userId?: string;
        workspaceId?: string;
        expectedProjectId?: string;
        includeArchived?: boolean;
        messageLimit?: number;
    }
): Promise<ActionResult<ConversationWithMessages | null>> {
    return withAction(async () => {
        const userContext = getCurrentUserContext();
        const userId = params?.userId || userContext.userId;
        const workspaceId = params?.workspaceId || userContext.workspaceId;
        const expectedProjectId = params?.expectedProjectId;
        const includeArchived = params?.includeArchived === true;
        const messageLimit = params?.messageLimit ?? DEFAULT_MESSAGE_LIMIT;

        const conversation = await prisma.aIConversation.findFirst({
            where: {
                id: conversationId,
                userId: userId || undefined,
                workspaceId: workspaceId || undefined,
                projectId: expectedProjectId || undefined,
                archived: includeArchived ? undefined : false,
            },
            include: {
                _count: {
                    select: { messages: true },
                },
            },
        });

        if (!conversation) return null;

        // Paginated message load: latest N messages (desc + reverse)
        const rawMessages = await prisma.aIMessage.findMany({
            where: { conversationId: conversation.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: messageLimit + 1,
        });
        const hasMore = rawMessages.length > messageLimit;
        const pageMessages = hasMore ? rawMessages.slice(0, messageLimit) : rawMessages;
        pageMessages.reverse(); // back to ascending chronological order

        // Artifacts always loaded fully (few per conversation)
        const artifacts = await prisma.artifact.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                type: true,
                status: true,
                title: true,
                payload: true,
                version: true,
                createdAt: true,
            },
        });

        return {
            id: conversation.id,
            title: conversation.title,
            context: conversation.context,
            page: conversation.page,
            projectId: conversation.projectId,
            studyId: conversation.studyId,
            messageCount: conversation._count.messages,
            createdAt: conversation.createdAt.toISOString(),
            updatedAt: conversation.updatedAt.toISOString(),
            hasMore,
            messages: pageMessages.map((msg) => ({
                id: msg.id,
                role: msg.role as "user" | "assistant" | "system",
                content: msg.content,
                attachments: msg.attachments
                    ? (msg.attachments as unknown as MessageAttachment[])
                    : undefined,
                createdAt: msg.createdAt.toISOString(),
            })),
            artifacts: artifacts.map((artifact) => ({
                id: artifact.id,
                type: artifact.type,
                status: artifact.status,
                title: artifact.title,
                payload: artifact.payload,
                version: artifact.version,
                createdAt: artifact.createdAt.toISOString(),
            })),
        };
    });
}

/**
 * Fetch a page of older messages for a conversation using cursor-based pagination.
 * Returns messages in ascending chronological order.
 */
export async function getConversationMessages(params: {
    conversationId: string;
    limit?: number;
    cursor: { createdAt: string | Date; id: string };
    userId?: string;
    workspaceId?: string;
    expectedProjectId?: string;
    includeArchived?: boolean;
}): Promise<ActionResult<PaginatedMessages>> {
    return withAction(async () => {
        const { conversationId, limit = DEFAULT_MESSAGE_LIMIT, cursor } = params;
        const userContext = getCurrentUserContext();
        const userId = params.userId || userContext.userId;
        const workspaceId = params.workspaceId || userContext.workspaceId;
        const expectedProjectId = params.expectedProjectId;
        const includeArchived = params.includeArchived === true;

        const conversation = await prisma.aIConversation.findFirst({
            where: {
                id: conversationId,
                userId: userId || undefined,
                workspaceId: workspaceId || undefined,
                projectId: expectedProjectId || undefined,
                archived: includeArchived ? undefined : false,
            },
            select: { id: true },
        });
        if (!conversation) {
            return { messages: [], hasMore: false };
        }

        const cursorDate =
            cursor.createdAt instanceof Date ? cursor.createdAt : new Date(cursor.createdAt);
        if (Number.isNaN(cursorDate.getTime())) {
            throw new Error("Invalid cursor date");
        }

        const messages = await prisma.aIMessage.findMany({
            where: {
                conversationId: conversation.id,
                OR: [
                    { createdAt: { lt: cursorDate } },
                    {
                        createdAt: { equals: cursorDate },
                        id: { lt: cursor.id },
                    },
                ],
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: limit + 1,
        });

        const hasMore = messages.length > limit;
        const page = hasMore ? messages.slice(0, limit) : messages;
        page.reverse(); // ascending chronological order

        return {
            messages: page.map((msg) => ({
                id: msg.id,
                role: msg.role as "user" | "assistant" | "system",
                content: msg.content,
                attachments: msg.attachments
                    ? (msg.attachments as unknown as MessageAttachment[])
                    : undefined,
                createdAt: msg.createdAt.toISOString(),
            })),
            hasMore,
        };
    });
}

/**
 * Create a new conversation
 * Multi-user ready: stores userId and workspaceId for ownership scoping
 */
export async function createConversation(params: {
    userId?: string;
    workspaceId?: string;
    projectId?: string;
    studyId?: string;
    page?: CopilotPage;
    context?: string;
    title?: string;
}): Promise<ActionResult<{ id: string }>> {
    return withAction(async () => {
        const { context = "project", title } = params;

        // Use provided IDs or fall back to placeholder for single-user mode
        const userContext = getCurrentUserContext();
        const userId = params.userId || userContext.userId;
        const workspaceId = params.workspaceId || userContext.workspaceId;
        const { projectId, studyId } = params;

        const conversation = await prisma.aIConversation.create({
            data: {
                userId,
                workspaceId,
                projectId,
                studyId,
                page: params.page,
                context,
                title: title || null,
            },
        });
        return { id: conversation.id };
    });
}

/**
 * Add a message to a conversation
 */
export async function addMessage(params: {
    conversationId: string;
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: MessageAttachment[];
}): Promise<ActionResult<{ id: string }>> {
    return withAction(async () => {
        const { conversationId, role, content, attachments } = params;

        // Add the message
        const message = await prisma.aIMessage.create({
            data: {
                conversationId,
                role,
                content,
                attachments: attachments && attachments.length > 0
                    ? (attachments as unknown as any)
                    : undefined,
            },
        });

        // Auto-generate title from first user message if no title exists.
        // Uses updateMany with a null-title filter so concurrent first messages
        // don't race — only the first writer wins; subsequent writes are no-ops.
        if (role === "user") {
            const autoTitle = content.length > 50 ? content.slice(0, 47) + "..." : content;
            await prisma.aIConversation.updateMany({
                where: { id: conversationId, title: null },
                data: { title: autoTitle },
            });
        }

        // Update conversation's updatedAt
        await prisma.aIConversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        return { id: message.id };
    });
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
    conversationId: string,
    title: string
): Promise<ActionResult<void>> {
    return withAction(async () => {
        await prisma.aIConversation.update({
            where: { id: conversationId },
            data: { title },
        });
    });
}

/**
 * Archive a conversation (soft delete)
 */
export async function archiveConversation(conversationId: string): Promise<ActionResult<void>> {
    return withAction(async () => {
        await prisma.aIConversation.update({
            where: { id: conversationId },
            data: { archived: true },
        });
    });
}

/**
 * Delete a conversation permanently
 */
export async function deleteConversation(conversationId: string): Promise<ActionResult<void>> {
    return withAction(async () => {
        await prisma.aIConversation.delete({
            where: { id: conversationId },
        });
    });
}

/**
 * Create a branched conversation by copying messages from an existing one.
 * If upToMessageId is provided, only messages up to and including that message are copied.
 */
export async function branchConversation(params: {
    conversationId: string;
    upToMessageId?: string;
    upToCreatedAt?: string;
    title?: string;
}): Promise<ActionResult<BranchedConversationResult>> {
    return withAction(async () => {
        const { conversationId, upToMessageId, upToCreatedAt, title } = params;
        const userContext = getCurrentUserContext();

        const source = await prisma.aIConversation.findFirst({
            where: {
                id: conversationId,
                userId: userContext.userId,
                workspaceId: userContext.workspaceId,
                archived: false,
            },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                },
                summary: true,
                _count: {
                    select: { messages: true },
                },
            },
        });

        if (!source) {
            throw new Error("Conversation not found");
        }

        let sourceMessages = source.messages;
        if (upToMessageId || upToCreatedAt) {
            let cutoffIndex = -1;

            if (upToMessageId) {
                cutoffIndex = sourceMessages.findIndex((m) => m.id === upToMessageId);
            }

            // Fallback for optimistic client-only IDs: resolve by timestamp boundary.
            if (cutoffIndex < 0 && upToCreatedAt) {
                const cutoffMs = new Date(upToCreatedAt).getTime();
                if (!Number.isNaN(cutoffMs)) {
                    for (let i = sourceMessages.length - 1; i >= 0; i--) {
                        const msgMs = new Date(sourceMessages[i].createdAt).getTime();
                        if (msgMs <= cutoffMs) {
                            cutoffIndex = i;
                            break;
                        }
                    }
                }
            }

            if (cutoffIndex < 0) {
                throw new Error("Branch cutoff message not found");
            }

            sourceMessages = sourceMessages.slice(0, cutoffIndex + 1);
        }

        const branchTitle = title
            ?? (source.title ? `${source.title} (branch)` : "Branched conversation");

        const created = await prisma.$transaction(async (tx) => {
            const conversation = await tx.aIConversation.create({
                data: {
                    userId: source.userId,
                    workspaceId: source.workspaceId,
                    title: branchTitle,
                    context: source.context,
                    page: source.page,
                    projectId: source.projectId,
                    studyId: source.studyId,
                },
            });

            if (sourceMessages.length > 0) {
                await tx.aIMessage.createMany({
                    data: sourceMessages.map((m) => ({
                        conversationId: conversation.id,
                        role: m.role,
                        content: m.content,
                        toolCalls: m.toolCalls as any,
                        toolResultId: m.toolResultId,
                        attachments: m.attachments as any,
                        createdAt: m.createdAt,
                    })),
                });
            }

            // When branching from the entire conversation, carry over compaction summary.
            if (!upToMessageId && !upToCreatedAt && source.summary) {
                await tx.conversationSummary.create({
                    data: {
                        conversationId: conversation.id,
                        summary: source.summary.summary,
                        keyPoints: source.summary.keyPoints,
                        decisions: source.summary.decisions,
                        followUpNeeded: source.summary.followUpNeeded,
                        messageCount: source.summary.messageCount,
                        lastSummarizedAt: source.summary.lastSummarizedAt,
                    },
                });
            }

            return conversation;
        });

        return {
            id: created.id,
            title: created.title,
            context: created.context,
            page: created.page,
            projectId: created.projectId,
            studyId: created.studyId,
            messageCount: sourceMessages.length,
            createdAt: created.createdAt.toISOString(),
            updatedAt: created.updatedAt.toISOString(),
            sourceConversationId: source.id,
        };
    });
}

/**
 * Get or create a conversation for the current context
 * If no active conversation exists, creates a new one
 * Multi-user ready: scopes by userId/workspaceId
 */
export async function getOrCreateConversation(params: {
    userId?: string;
    workspaceId?: string;
    projectId?: string;
    studyId?: string;
    page?: CopilotPage;
}): Promise<ActionResult<ConversationWithMessages>> {
    return withAction(async () => {
        const { projectId, studyId, page } = params;

        // Use provided IDs or fall back to placeholder for single-user mode
        const userContext = getCurrentUserContext();
        const userId = params.userId || userContext.userId;
        const workspaceId = params.workspaceId || userContext.workspaceId;

        // Try to find an existing recent conversation
        const existing = await prisma.aIConversation.findFirst({
            where: {
                userId: userId || undefined,
                workspaceId: workspaceId || undefined,
                projectId: projectId || undefined,
                studyId: studyId || undefined,
                page: page || undefined,
                archived: false,
            },
            include: {
                _count: {
                    select: { messages: true },
                },
            },
            orderBy: { updatedAt: "desc" },
        });

        if (existing) {
            // Paginated message load (latest page)
            const rawMessages = await prisma.aIMessage.findMany({
                where: { conversationId: existing.id },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: DEFAULT_MESSAGE_LIMIT + 1,
            });
            const hasMore = rawMessages.length > DEFAULT_MESSAGE_LIMIT;
            const pageMessages = hasMore ? rawMessages.slice(0, DEFAULT_MESSAGE_LIMIT) : rawMessages;
            pageMessages.reverse();

            return {
                id: existing.id,
                title: existing.title,
                context: existing.context,
                page: existing.page,
                projectId: existing.projectId,
                studyId: existing.studyId,
                messageCount: existing._count.messages,
                createdAt: existing.createdAt.toISOString(),
                updatedAt: existing.updatedAt.toISOString(),
                hasMore,
                messages: pageMessages.map((msg) => ({
                    id: msg.id,
                    role: msg.role as "user" | "assistant" | "system",
                    content: msg.content,
                    attachments: msg.attachments
                        ? (msg.attachments as unknown as MessageAttachment[])
                        : undefined,
                    createdAt: msg.createdAt.toISOString(),
                })),
                artifacts: [],
            };
        }

        // Create new conversation with ownership scoping
        const newConv = await prisma.aIConversation.create({
            data: {
                userId,
                workspaceId,
                projectId,
                studyId,
                page,
                context: studyId ? "study" : projectId ? "project" : "global",
            },
        });

        return {
            id: newConv.id,
            title: null,
            context: newConv.context,
            page: newConv.page,
            projectId: newConv.projectId,
            studyId: newConv.studyId,
            messageCount: 0,
            createdAt: newConv.createdAt.toISOString(),
            updatedAt: newConv.updatedAt.toISOString(),
            hasMore: false,
            messages: [],
            artifacts: [],
        };
    });
}
