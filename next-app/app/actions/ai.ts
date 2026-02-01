/**
 * AI Server Actions
 * Server-side actions for AI operations
 */

"use server";

import {
    getAIService,
    getOrCreateConversation,
    createConversation,
    listConversations,
    getConversationMessages,
    clearConversation,
    deleteConversation,
} from "@/lib/server/ai";
import type { AIMessage, AIResponse, ChatOptions, ConversationContext, AIConversation } from "@/types/ai";

/**
 * Send a chat message and get a response
 */
export async function chatAction(
    messages: AIMessage[],
    options?: ChatOptions
): Promise<AIResponse> {
    const service = getAIService();
    return service.chat(messages, options);
}

/**
 * Chat with conversation memory
 * Automatically manages conversation history
 */
export async function chatWithMemoryAction(
    userMessage: string,
    context: ConversationContext,
    options?: ChatOptions & { projectId?: string; studyId?: string }
): Promise<{ response: AIResponse; conversationId: string }> {
    const service = getAIService();
    return service.chatWithMemory(userMessage, context, options);
}

/**
 * Get or create a conversation
 */
export async function getConversationAction(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversation> {
    return getOrCreateConversation(context, projectId, studyId);
}

/**
 * Create a new conversation
 */
export async function createConversationAction(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversation> {
    return createConversation(context, projectId, studyId);
}

/**
 * List conversations for a context
 */
export async function listConversationsAction(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversation[]> {
    return listConversations(context, projectId, studyId);
}

/**
 * Get messages from a conversation
 */
export async function getConversationMessagesAction(
    conversationId: string,
    limit?: number
): Promise<AIMessage[]> {
    return getConversationMessages(conversationId, limit);
}

/**
 * Clear a conversation
 */
export async function clearConversationAction(
    conversationId: string
): Promise<void> {
    return clearConversation(conversationId);
}

/**
 * Delete a conversation
 */
export async function deleteConversationAction(
    conversationId: string
): Promise<void> {
    return deleteConversation(conversationId);
}
