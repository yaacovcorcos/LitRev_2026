/**
 * AI Service
 * Central service for AI operations
 * Now with structured memory integration and tool execution loop
 */

import type { AIMessage, AIResponse, ChatOptions, AIStreamChunk, ConversationContext, ToolCall } from "@/types/ai";
import { BaseAIProvider, getOpenAIProvider } from "./providers";
import { getOrCreateConversation, addMessageToConversation } from "./memory";
import { validateRateLimits, recordUsage } from "./rate-limiter";
import { retrieveAndFormatMemories } from "@/lib/server/memory";
import { AI_CONFIG } from "@/lib/ai/config";
import { AVAILABLE_TOOLS, getToolDefinitions, executeTool } from "./tools";

const MAX_TOOL_ITERATIONS = 5;

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
     * Stream chat with tool execution loop.
     * Handles multiple tool calls per turn and loops until the AI finishes with text.
     * Tool-call/tool-result messages are kept in the local loop only — not persisted.
     */
    async *streamChatWithTools(
        messages: AIMessage[],
        options?: ChatOptions
    ): AsyncIterable<AIStreamChunk> {
        const toolDefs = getToolDefinitions();
        if (toolDefs.length === 0) {
            // No tools available, fall through to normal streaming
            yield* this.streamChat(messages, options);
            return;
        }

        const optionsWithTools: ChatOptions = {
            ...options,
            tools: toolDefs,
        };

        const currentMessages = [...messages];

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
            const collectedToolCalls: ToolCall[] = [];
            let contentSoFar = "";
            let gotDone = false;

            for await (const chunk of this.streamChat(currentMessages, optionsWithTools)) {
                if (chunk.type === "tool_call" && chunk.toolCall) {
                    collectedToolCalls.push(chunk.toolCall);
                    // Yield tool_call to client for status display
                    yield chunk;
                } else if (chunk.type === "content") {
                    contentSoFar += chunk.content || "";
                    yield chunk;
                } else if (chunk.type === "done") {
                    gotDone = true;
                    // Don't yield done yet if we have tool calls to process
                    if (collectedToolCalls.length === 0) {
                        yield chunk;
                    }
                } else if (chunk.type === "error") {
                    yield chunk;
                    return;
                }
            }

            // If no tool calls, we're done
            if (collectedToolCalls.length === 0) {
                return;
            }

            // Build assistant message with tool calls
            const assistantMsg: AIMessage = {
                id: `tool-loop-assistant-${iteration}`,
                role: "assistant",
                content: contentSoFar,
                toolCalls: collectedToolCalls,
                createdAt: new Date().toISOString(),
            };
            currentMessages.push(assistantMsg);

            // Execute all tool calls and append results
            for (const tc of collectedToolCalls) {
                const result = await executeTool(tc.name, tc.arguments, tc.id);

                // Yield tool result to client
                yield { type: "tool_result", toolResult: result };

                // Add tool result message for next iteration
                const toolMsg: AIMessage = {
                    id: `tool-result-${tc.id}`,
                    role: "tool",
                    content: JSON.stringify(result.result ?? result.error ?? ""),
                    toolResultId: tc.id,
                    createdAt: new Date().toISOString(),
                };
                currentMessages.push(toolMsg);
            }

            // Loop continues — next iteration will call the provider again
            // with the tool results so the AI can respond
        }

        // Safety: if we hit the max iterations, yield what we have
        yield {
            type: "done",
            content: "I've reached the maximum number of tool calls. Please try rephrasing your request.",
        };
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
     * Uses tool loop when tools are available
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

        // Use tool loop when tools are available, otherwise fall through to normal streaming
        const chatOptions = {
            ...options,
            projectId: projectId || "global",
        };

        const streamSource = AVAILABLE_TOOLS.length > 0
            ? this.streamChatWithTools(historyMessages, chatOptions)
            : this.streamChat(historyMessages, chatOptions);

        for await (const chunk of streamSource) {
            if (chunk.type === "content" && chunk.content) {
                fullContent += chunk.content;
            }
            yield { ...chunk, conversationId: conversation.id };
        }

        // Save only the final AI text response to memory (not tool messages)
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
