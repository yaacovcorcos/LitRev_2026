/**
 * AI Service
 * Central service for AI operations
 * Now with structured memory integration
 */

import type { AIMessage, AIResponse, ChatOptions, AIStreamChunk, ConversationContext } from "@/types/ai";
import { BaseAIProvider, getOpenAIProvider } from "./providers";
import { getOrCreateConversation, addMessageToConversation } from "./memory";
import { validateRateLimits, recordUsage } from "./rate-limiter";
import { retrieveAndFormatMemories } from "@/lib/server/memory";
import { AI_CONFIG } from "@/lib/ai/config";

class AIService {
    private providers = new Map<string, BaseAIProvider>();
    private activeProviderId: string = AI_CONFIG.defaultProvider;

    constructor() {
        // Register default providers
        this.registerProvider(getOpenAIProvider());
    }

    /**
     * Register a provider
     */
    registerProvider(provider: BaseAIProvider): void {
        this.providers.set(provider.id, provider);
    }

    /**
     * Set the active provider
     */
    setActiveProvider(id: string): void {
        if (!this.providers.has(id)) {
            throw new Error(`Provider not found: ${id}`);
        }
        this.activeProviderId = id;
    }

    /**
     * Get the active provider
     */
    getActiveProvider(): BaseAIProvider {
        const provider = this.providers.get(this.activeProviderId);
        if (!provider) {
            throw new Error(`Active provider not found: ${this.activeProviderId}`);
        }
        return provider;
    }

    /**
     * Send a chat request
     */
    async chat(
        messages: AIMessage[],
        options?: ChatOptions
    ): Promise<AIResponse> {
        const projectId = options?.projectId || "global";

        // Validate rate limits
        await validateRateLimits(projectId);

        const provider = this.getActiveProvider();
        const response = await provider.chat(messages, options);

        // Record usage
        await recordUsage(
            projectId,
            response.model,
            response.usage.inputTokens,
            response.usage.outputTokens
        );

        return response;
    }

    /**
     * Send a chat request with streaming
     */
    async *streamChat(
        messages: AIMessage[],
        options?: ChatOptions
    ): AsyncIterable<AIStreamChunk> {
        const projectId = options?.projectId || "global";

        // Validate rate limits
        await validateRateLimits(projectId);

        const provider = this.getActiveProvider();

        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        for await (const chunk of provider.streamChat(messages, options)) {
            if (chunk.type === "done" && chunk.usage) {
                totalInputTokens = chunk.usage.inputTokens;
                totalOutputTokens = chunk.usage.outputTokens;
            }
            yield chunk;
        }

        // Record usage after streaming completes
        await recordUsage(
            projectId,
            options?.model || AI_CONFIG.defaultModel,
            totalInputTokens,
            totalOutputTokens
        );
    }

    /**
     * Chat with conversation memory
     * Automatically loads conversation history and saves new messages
     * Also injects relevant structured memories (UserMemory, ProjectMemory, StudyMemory)
     */
    async chatWithMemory(
        userMessage: string,
        context: ConversationContext,
        options?: ChatOptions & { projectId?: string; studyId?: string; userId?: string }
    ): Promise<{ response: AIResponse; conversationId: string }> {
        const projectId = options?.projectId;
        const studyId = options?.studyId;
        const userId = options?.userId || "default-user"; // TODO: Get from auth context

        // Get or create conversation
        const conversation = await getOrCreateConversation(context, projectId, studyId);

        // Retrieve relevant memories
        const memoriesContext = await retrieveAndFormatMemories({
            userId,
            projectId,
            studyId,
            query: userMessage,
        });

        // Add user message to conversation
        const userMsg = await addMessageToConversation(conversation.id, {
            role: "user",
            content: userMessage,
        });

        // Prepare messages for AI (include history + memory context)
        const historyMessages: AIMessage[] = [...conversation.messages, userMsg];

        // If we have memories, prepend them as a system message
        if (memoriesContext) {
            historyMessages.unshift({
                id: "memory-context",
                role: "system",
                content: memoriesContext,
                createdAt: new Date().toISOString(),
            });
        }

        // Get AI response
        const response = await this.chat(historyMessages, {
            ...options,
            projectId: projectId || "global",
        });

        // Save AI response to memory
        await addMessageToConversation(conversation.id, {
            role: "assistant",
            content: response.content,
        });

        return {
            response,
            conversationId: conversation.id,
        };
    }

    /**
     * Stream chat with conversation memory
     * Also injects relevant structured memories (UserMemory, ProjectMemory, StudyMemory)
     */
    async *streamChatWithMemory(
        userMessage: string,
        context: ConversationContext,
        options?: ChatOptions & { projectId?: string; studyId?: string; userId?: string }
    ): AsyncIterable<AIStreamChunk & { conversationId?: string }> {
        const projectId = options?.projectId;
        const studyId = options?.studyId;
        const userId = options?.userId || "default-user"; // TODO: Get from auth context

        // Get or create conversation
        const conversation = await getOrCreateConversation(context, projectId, studyId);

        // Retrieve relevant memories
        const memoriesContext = await retrieveAndFormatMemories({
            userId,
            projectId,
            studyId,
            query: userMessage,
        });

        // Add user message to conversation
        const userMsg = await addMessageToConversation(conversation.id, {
            role: "user",
            content: userMessage,
        });

        // Prepare messages for AI (include history + memory context)
        const historyMessages: AIMessage[] = [...conversation.messages, userMsg];

        // If we have memories, prepend them as a system message
        if (memoriesContext) {
            historyMessages.unshift({
                id: "memory-context",
                role: "system",
                content: memoriesContext,
                createdAt: new Date().toISOString(),
            });
        }

        let fullContent = "";

        // Stream the response
        for await (const chunk of this.streamChat(historyMessages, {
            ...options,
            projectId: projectId || "global",
        })) {
            if (chunk.type === "content" && chunk.content) {
                fullContent += chunk.content;
            }
            yield { ...chunk, conversationId: conversation.id };
        }

        // Save AI response to memory after streaming completes
        if (fullContent) {
            await addMessageToConversation(conversation.id, {
                role: "assistant",
                content: fullContent,
            });
        }
    }
}

// Singleton instance
let aiServiceInstance: AIService | null = null;

export function getAIService(): AIService {
    if (!aiServiceInstance) {
        aiServiceInstance = new AIService();
    }
    return aiServiceInstance;
}

export { AIService };
