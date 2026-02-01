/**
 * AI Memory Manager
 * DB-backed memory for AI conversations
 */

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import type { AIMessage, ConversationContext, AIConversation } from "@/types/ai";

function parseToolCalls(value: unknown): AIMessage["toolCalls"] {
    if (!Array.isArray(value)) return undefined;
    const filtered = value.filter((item) => {
        if (!item || typeof item !== "object") return false;
        const record = item as Record<string, unknown>;
        return typeof record.id === "string" && typeof record.name === "string";
    });
    return filtered.length > 0 ? (filtered as AIMessage["toolCalls"]) : undefined;
}

/**
 * Get or create a conversation for the given context
 */
export async function getOrCreateConversation(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversation> {
    // Try to find existing conversation
    const existing = await prisma.aIConversation.findFirst({
        where: {
            context,
            projectId: projectId || null,
            studyId: studyId || null,
        },
        include: {
            messages: {
                orderBy: { createdAt: "asc" },
            },
        },
        orderBy: { updatedAt: "desc" },
    });

    if (existing) {
        return {
            id: existing.id,
            context: existing.context as ConversationContext,
            projectId: existing.projectId || undefined,
            studyId: existing.studyId || undefined,
            messages: existing.messages.map((m) => ({
                id: m.id,
                role: m.role as AIMessage["role"],
                content: m.content,
                toolCalls: parseToolCalls(m.toolCalls),
                createdAt: m.createdAt.toISOString(),
            })),
            createdAt: existing.createdAt.toISOString(),
            updatedAt: existing.updatedAt.toISOString(),
        };
    }

    // Create new conversation
    const created = await prisma.aIConversation.create({
        data: {
            context,
            projectId: projectId || null,
            studyId: studyId || null,
        },
        include: {
            messages: true,
        },
    });

    return {
        id: created.id,
        context: created.context as ConversationContext,
        projectId: created.projectId || undefined,
        studyId: created.studyId || undefined,
        messages: [],
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
    };
}

/**
 * Create a new conversation (always creates a fresh record)
 */
export async function createConversation(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversation> {
    const created = await prisma.aIConversation.create({
        data: {
            context,
            projectId: projectId || null,
            studyId: studyId || null,
        },
        include: { messages: true },
    });

    return {
        id: created.id,
        context: created.context as ConversationContext,
        projectId: created.projectId || undefined,
        studyId: created.studyId || undefined,
        messages: [],
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
    };
}

/**
 * List conversations for a context (latest first)
 */
export async function listConversations(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversation[]> {
    const conversations = await prisma.aIConversation.findMany({
        where: {
            context,
            projectId: projectId || null,
            studyId: studyId || null,
        },
        orderBy: { updatedAt: "desc" },
        include: {
            messages: {
                orderBy: { createdAt: "asc" },
                take: 1,
            },
        },
    });

    return conversations.map((conv) => ({
        id: conv.id,
        context: conv.context as ConversationContext,
        projectId: conv.projectId || undefined,
        studyId: conv.studyId || undefined,
        messages: conv.messages.map((m) => ({
            id: m.id,
            role: m.role as AIMessage["role"],
            content: m.content,
            toolCalls: parseToolCalls(m.toolCalls),
            createdAt: m.createdAt.toISOString(),
        })),
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
    }));
}

/**
 * Add a message to a conversation
 */
export async function addMessageToConversation(
    conversationId: string,
    message: Omit<AIMessage, "id" | "createdAt">
): Promise<AIMessage> {
    const created = await prisma.aIMessage.create({
        data: {
            conversationId,
            role: message.role,
            content: message.content,
            toolCalls: (message.toolCalls ?? undefined) as Prisma.InputJsonValue,
        },
    });

    // Update conversation timestamp
    await prisma.aIConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
    });

    return {
        id: created.id,
        role: created.role as AIMessage["role"],
        content: created.content,
        toolCalls: parseToolCalls(created.toolCalls),
        createdAt: created.createdAt.toISOString(),
    };
}

/**
 * Get messages from a conversation
 */
export async function getConversationMessages(
    conversationId: string,
    limit?: number
): Promise<AIMessage[]> {
    const messages = await prisma.aIMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: limit,
    });

    return messages.map((m) => ({
        id: m.id,
        role: m.role as AIMessage["role"],
        content: m.content,
        toolCalls: parseToolCalls(m.toolCalls),
        createdAt: m.createdAt.toISOString(),
    }));
}

/**
 * Clear all messages from a conversation
 */
export async function clearConversation(conversationId: string): Promise<void> {
    await prisma.aIMessage.deleteMany({
        where: { conversationId },
    });
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(conversationId: string): Promise<void> {
    await prisma.aIConversation.delete({
        where: { id: conversationId },
    });
}
