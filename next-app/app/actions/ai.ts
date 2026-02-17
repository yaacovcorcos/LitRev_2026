/**
 * AI Server Actions (LEGACY)
 * @deprecated Use `app/actions/conversations.ts` instead.
 * This file is retained only for backward compatibility and will be removed.
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

/** @deprecated Use `app/actions/conversations.ts` instead */
export async function chatAction(
    messages: AIMessage[],
    options?: ChatOptions
): Promise<AIResponse> {
    const service = getAIService();
    return service.chat(messages, options);
}

/** @deprecated Use `app/actions/conversations.ts` instead */
export async function chatWithMemoryAction(
    userMessage: string,
    context: ConversationContext,
    options?: ChatOptions & { projectId?: string; studyId?: string }
): Promise<{ response: AIResponse; conversationId: string }> {
    const service = getAIService();
    return service.chatWithMemory(userMessage, context, options);
}

/** @deprecated Use `app/actions/conversations.ts` instead */
export async function getConversationAction(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversation> {
    return getOrCreateConversation(context, projectId, studyId);
}

/** @deprecated Use `app/actions/conversations.ts` instead */
export async function createConversationAction(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversation> {
    return createConversation(context, projectId, studyId);
}

/** @deprecated Use `app/actions/conversations.ts` instead */
export async function listConversationsAction(
    context: ConversationContext,
    projectId?: string,
    studyId?: string
): Promise<AIConversation[]> {
    return listConversations(context, projectId, studyId);
}

/** @deprecated Use `app/actions/conversations.ts` instead */
export async function getConversationMessagesAction(
    conversationId: string,
    limit?: number
): Promise<AIMessage[]> {
    return getConversationMessages(conversationId, limit);
}

/** @deprecated Use `app/actions/conversations.ts` instead */
export async function clearConversationAction(
    conversationId: string
): Promise<void> {
    return clearConversation(conversationId);
}

/** @deprecated Use `archiveConversation` from `app/actions/conversations.ts` instead */
export async function deleteConversationAction(
    conversationId: string
): Promise<void> {
    return deleteConversation(conversationId);
}
