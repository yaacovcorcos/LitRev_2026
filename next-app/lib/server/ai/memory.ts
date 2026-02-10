/**
 * AI Memory Manager
 * DB-backed memory for AI conversations
 */

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import type { AIMessage, ConversationContext, AIConversation } from "@/types/ai";
import { COMPACTION_THRESHOLD_MESSAGES, COMPACTION_SUMMARY_PROMPT } from "@/lib/agent/compaction";

export type SummaryData = {
    summary: string;
    keyPoints: string[];
    decisions: string[];
    followUpNeeded: string[];
    messageCount: number;
    lastSummarizedAt: string;
};

export type AIConversationWithSummary = AIConversation & { summaryData?: SummaryData };

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
                toolResultId: m.toolResultId ?? undefined,
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
            toolResultId: message.toolResultId ?? undefined,
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
        toolResultId: created.toolResultId ?? undefined,
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
        toolResultId: m.toolResultId ?? undefined,
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

/**
 * Get or create a conversation with summary data loaded in one query.
 */
export async function getConversationWithSummary(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversationWithSummary> {
    const existing = await prisma.aIConversation.findFirst({
        where: {
            context,
            projectId: projectId || null,
            studyId: studyId || null,
        },
        include: {
            messages: { orderBy: { createdAt: "asc" } },
            summary: true,
        },
        orderBy: { updatedAt: "desc" },
    });

    if (existing) {
        const result: AIConversationWithSummary = {
            id: existing.id,
            context: existing.context as ConversationContext,
            projectId: existing.projectId || undefined,
            studyId: existing.studyId || undefined,
            messages: existing.messages.map((m) => ({
                id: m.id,
                role: m.role as AIMessage["role"],
                content: m.content,
                toolCalls: parseToolCalls(m.toolCalls),
                toolResultId: m.toolResultId ?? undefined,
                createdAt: m.createdAt.toISOString(),
            })),
            createdAt: existing.createdAt.toISOString(),
            updatedAt: existing.updatedAt.toISOString(),
        };

        if (existing.summary) {
            result.summaryData = {
                summary: existing.summary.summary,
                keyPoints: existing.summary.keyPoints,
                decisions: existing.summary.decisions,
                followUpNeeded: existing.summary.followUpNeeded,
                messageCount: existing.summary.messageCount,
                lastSummarizedAt: existing.summary.lastSummarizedAt.toISOString(),
            };
        }
        return result;
    }

    // Create new conversation
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
 * Auto-summarize conversation if it's grown past the threshold.
 * Blocking when near budget, fire-and-forget otherwise.
 */
export async function autoSummarizeIfNeeded(
    conversationId: string,
    totalMessages: number,
    existingSummaryMessageCount: number,
    budget: number,
    currentTokens: number
): Promise<void> {
    const unsummarized = totalMessages - existingSummaryMessageCount;
    if (unsummarized < COMPACTION_THRESHOLD_MESSAGES) return;

    const doSummarize = async () => {
        try {
            // Load existing summary + unsummarized messages
            const conv = await prisma.aIConversation.findUnique({
                where: { id: conversationId },
                include: {
                    summary: true,
                    messages: { orderBy: { createdAt: "asc" } },
                },
            });
            if (!conv) return;

            const existingSummary = conv.summary?.summary ?? "";
            const unsummarizedMsgs = conv.summary?.lastSummarizedAt
                ? conv.messages.filter(m => m.createdAt > conv.summary!.lastSummarizedAt)
                : conv.messages;

            if (unsummarizedMsgs.length === 0) return;

            // Build transcript of new messages
            const transcript = unsummarizedMsgs
                .map(m => `[${m.role}]: ${m.content}`)
                .join("\n\n");

            const userContent = existingSummary
                ? `Existing summary:\n${existingSummary}\n\nNew messages to incorporate:\n${transcript}`
                : `Messages to summarize:\n${transcript}`;

            // Call AI for summarization (use conversation's projectId for rate-limit accounting)
            const { getAIService } = await import("@/lib/server/ai");
            const aiService = getAIService();
            const response = await aiService.chat(
                [
                    { id: "sys", role: "system", content: COMPACTION_SUMMARY_PROMPT, createdAt: new Date().toISOString() },
                    { id: "user", role: "user", content: userContent, createdAt: new Date().toISOString() },
                ],
                { model: "grok-4-1-fast", temperature: 0.2, maxTokens: 1500, projectId: conv.projectId ?? undefined }
            );

            // Parse response
            let parsed: { summary: string; keyPoints: string[]; decisions: string[]; followUpNeeded: string[] };
            try {
                const cleaned = response.content
                    .replace(/^```(?:json)?\s*/i, "")
                    .replace(/\s*```$/i, "")
                    .trim();
                parsed = JSON.parse(cleaned);
            } catch {
                parsed = {
                    summary: response.content.slice(0, 500),
                    keyPoints: [],
                    decisions: [],
                    followUpNeeded: [],
                };
            }

            // Upsert summary
            await prisma.conversationSummary.upsert({
                where: { conversationId },
                create: {
                    conversationId,
                    summary: parsed.summary,
                    keyPoints: parsed.keyPoints,
                    decisions: parsed.decisions,
                    followUpNeeded: parsed.followUpNeeded,
                    messageCount: conv.messages.length,
                    lastSummarizedAt: new Date(),
                },
                update: {
                    summary: parsed.summary,
                    keyPoints: parsed.keyPoints,
                    decisions: parsed.decisions,
                    followUpNeeded: parsed.followUpNeeded,
                    messageCount: conv.messages.length,
                    lastSummarizedAt: new Date(),
                },
            });
        } catch (error) {
            console.error("[autoSummarize] Failed:", error);
        }
    };

    // Block when near budget (next turn will need the summary), otherwise fire-and-forget
    if (currentTokens > budget * 0.8) {
        await doSummarize();
    } else {
        doSummarize().catch(() => {});
    }
}
