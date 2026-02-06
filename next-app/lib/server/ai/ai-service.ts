/**
 * AI Service
 * Central service for AI operations
 * Now with structured memory integration and tool execution loop
 */

import type { AIMessage, AIResponse, ChatOptions, AIStreamChunk, ConversationContext, ToolCall, ToolResult } from "@/types/ai";
import type { ArtifactType } from "@/types/artifacts";
import type { AutonomyLevel } from "@/types/agent";
import { BaseAIProvider, getOpenAIProvider, getAnthropicProvider, getXAIProvider } from "./providers";
import { getOrCreateConversation, addMessageToConversation } from "./memory";
import { validateRateLimits, recordUsage } from "./rate-limiter";
import { retrieveAndFormatMemories } from "@/lib/server/memory";
import { AI_CONFIG, getProviderForModel } from "@/lib/ai/config";
import { AVAILABLE_TOOLS, getToolDefinitions, executeTool, getTool, resolveAutonomyLevel } from "./tools";
import { startRun, endRun } from "@/lib/server/agent/run";
import { emitEvent } from "@/lib/server/agent/events";
import { createArtifact, applyArtifact } from "@/lib/server/agent/artifacts";
import { getAutonomyConfig, getToolAutonomyLevel } from "@/lib/server/agent/autonomy";

const MAX_TOOL_ITERATIONS = 5;

class AIService {
    private providers = new Map<string, BaseAIProvider>();
    private activeProviderId: string = AI_CONFIG.defaultProvider;

    constructor() {
        // Register all configured providers
        const openai = getOpenAIProvider();
        if (openai.isConfigured()) this.registerProvider(openai);

        const anthropic = getAnthropicProvider();
        if (anthropic.isConfigured()) this.registerProvider(anthropic);

        const xai = getXAIProvider();
        if (xai.isConfigured()) this.registerProvider(xai);
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
     * Resolve the correct provider for a model ID.
     * Falls back to the active provider if model is unspecified or unknown.
     */
    resolveProvider(modelId?: string): BaseAIProvider {
        if (modelId) {
            const providerId = getProviderForModel(modelId);
            if (providerId) {
                const provider = this.providers.get(providerId);
                if (!provider) {
                    const envVar = providerId === "anthropic" ? "ANTHROPIC_API_KEY"
                        : providerId === "xai" ? "XAI_API_KEY"
                        : "OPENAI_API_KEY";
                    throw new Error(
                        `Provider "${providerId}" is not configured. Set the ${envVar} environment variable.`
                    );
                }
                return provider;
            }
        }
        return this.getActiveProvider();
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

        const provider = this.resolveProvider(options?.model);
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

        const provider = this.resolveProvider(options?.model);

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
     * Execute a tool call with autonomy-aware behavior.
     * Yields artifact chunks when autonomy level triggers artifact creation.
     * Returns the tool result for the AI loop continuation.
     */
    async *executeToolWithAutonomy(
        toolCall: ToolCall,
        runId: string,
        projectId: string,
        conversationId: string,
        userId?: string
    ): AsyncGenerator<AIStreamChunk, ToolResult> {
        const tool = getTool(toolCall.name);

        // Resolve autonomy level
        const autonomyConfig = await getAutonomyConfig(userId, projectId);
        const configuredLevel = getToolAutonomyLevel(toolCall.name, {
            preset: autonomyConfig.preset,
            toolOverrides: (autonomyConfig.toolOverrides ?? {}) as Record<string, unknown>,
        });
        const level = resolveAutonomyLevel(toolCall.name, configuredLevel, tool?.autonomy);

        // Emit tool_call event
        await emitEvent(runId, "tool_call", {
            toolName: toolCall.name,
            arguments: toolCall.arguments,
            autonomyLevel: level,
        }, { toolName: toolCall.name });

        // Level 0 (Disabled): don't execute
        if (level === 0) {
            const result: ToolResult = {
                callId: toolCall.id,
                result: null,
                error: `Tool "${toolCall.name}" is disabled by autonomy configuration.`,
            };
            await emitEvent(runId, "tool_result", { error: result.error }, { toolName: toolCall.name });
            return result;
        }

        // Level 1 (Suggest): don't execute, return suggestion
        if (level === 1) {
            const result: ToolResult = {
                callId: toolCall.id,
                result: `[Suggestion] I would call "${toolCall.name}" with: ${JSON.stringify(toolCall.arguments)}. Approve this action to proceed.`,
            };
            await emitEvent(runId, "tool_result", { suggestion: true }, { toolName: toolCall.name });
            return result;
        }

        // Level >= 2: execute the tool
        const startTime = Date.now();
        const result = await executeTool(toolCall.name, toolCall.arguments, toolCall.id, {
            projectId,
            userId,
            runId,
            autonomyLevel: level,
        });
        const durationMs = Date.now() - startTime;

        // Emit tool_result event
        await emitEvent(runId, "tool_result", {
            success: !result.error,
            error: result.error,
        }, { toolName: toolCall.name, durationMs });

        // If tool errored, just return the result
        if (result.error) {
            return result;
        }

        // Determine artifact type from tool name
        const artifactType = mapToolToArtifactType(toolCall.name);

        if (artifactType && result.result) {
            if (level === 2) {
                // Propose: create artifact with "proposed" status, yield to client
                const artifact = await createArtifact({
                    runId,
                    projectId,
                    conversationId,
                    userId,
                    type: artifactType,
                    title: mapToolToArtifactTitle(toolCall.name, toolCall.arguments),
                    payload: result.result,
                });

                yield {
                    type: "artifact",
                    artifactId: artifact.id,
                    artifactType: artifact.type,
                    artifactStatus: "proposed",
                    artifactTitle: artifact.title,
                    artifactPayload: artifact.payload,
                    artifactVersion: 1,
                };
            } else if (level === 3) {
                // Auto-notify: create artifact as auto_applied, apply it, yield to client
                const artifact = await createArtifact({
                    runId,
                    projectId,
                    conversationId,
                    userId,
                    type: artifactType,
                    title: mapToolToArtifactTitle(toolCall.name, toolCall.arguments),
                    payload: result.result,
                });

                await applyArtifact(artifact.id);

                yield {
                    type: "artifact",
                    artifactId: artifact.id,
                    artifactType: artifact.type,
                    artifactStatus: "auto_applied",
                    artifactTitle: artifact.title,
                    artifactPayload: artifact.payload,
                    artifactVersion: 1,
                };
            }
            // Level 4 (Auto-silent): execute + apply but don't yield artifact to client
            else if (level === 4) {
                const artifact = await createArtifact({
                    runId,
                    projectId,
                    conversationId,
                    userId,
                    type: artifactType,
                    title: mapToolToArtifactTitle(toolCall.name, toolCall.arguments),
                    payload: result.result,
                });

                await applyArtifact(artifact.id);
            }
        }

        return result;
    }

    /**
     * Stream chat with artifacts and agent run lifecycle.
     * Wraps the tool execution loop with AgentRun creation, autonomy-aware
     * tool execution, and run lifecycle events.
     */
    async *streamChatWithArtifacts(
        userMessage: string,
        context: ConversationContext,
        options?: ChatOptions & { projectId?: string; studyId?: string; userId?: string; planId?: string }
    ): AsyncIterable<AIStreamChunk & { conversationId?: string }> {
        const projectId = options?.projectId;
        const studyId = options?.studyId;
        const userId = options?.userId || "single-user";

        // Get or create conversation
        const conversation = await getOrCreateConversation(context, projectId, studyId);

        // Start an agent run
        const run = await startRun({
            projectId: projectId || "global",
            conversationId: conversation.id,
            userId,
            trigger: "user_message",
            agentMode: "general",
            model: options?.model,
        });

        // Yield run_start event
        yield { type: "run_start", runId: run.id, conversationId: conversation.id };

        // Emit user message event
        await emitEvent(run.id, "message", { content: userMessage }, { messageRole: "user" });

        try {
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

            // Prepare messages
            const historyMessages: AIMessage[] = [...conversation.messages, userMsg];
            if (memoriesContext) {
                historyMessages.unshift({
                    id: "memory-context",
                    role: "system",
                    content: memoriesContext,
                    createdAt: new Date().toISOString(),
                });
            }

            // Check for multi-step workflow (plan-before-act)
            if (!options?.planId) {
                const { detectMultiStepWorkflow, generatePlan } = await import("@/lib/server/agent/planner");
                const toolNames = AVAILABLE_TOOLS.map((t) => t.definition.name);
                if (detectMultiStepWorkflow(userMessage, toolNames)) {
                    yield { type: "progress", progressMessage: "Creating a plan...", conversationId: conversation.id };

                    const planPayload = await generatePlan(userMessage, {
                        projectId: projectId || "global",
                        hasProtocol: false, // TODO: check project state
                        studyCount: 0,
                    });

                    const artifact = await createArtifact({
                        runId: run.id,
                        projectId: projectId || "global",
                        conversationId: conversation.id,
                        userId,
                        type: "plan",
                        title: "Execution Plan",
                        payload: planPayload,
                    });

                    yield {
                        type: "artifact",
                        artifactId: artifact.id,
                        artifactType: "plan",
                        artifactStatus: "proposed",
                        artifactTitle: "Execution Plan",
                        artifactPayload: planPayload,
                        artifactVersion: 1,
                        conversationId: conversation.id,
                    };

                    await endRun(run.id, "completed");
                    yield { type: "run_end", runId: run.id, runStatus: "completed", conversationId: conversation.id };
                    return;
                }
            }

            // Run the tool execution loop with autonomy
            const toolDefs = getToolDefinitions();
            const chatOptions: ChatOptions = {
                ...options,
                projectId: projectId || "global",
                ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
            };

            const currentMessages = [...historyMessages];
            let fullContent = "";
            let totalTokensIn = 0;
            let totalTokensOut = 0;

            for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
                const collectedToolCalls: ToolCall[] = [];
                let contentSoFar = "";
                let gotDone = false;

                for await (const chunk of this.streamChat(currentMessages, chatOptions)) {
                    if (chunk.type === "tool_call" && chunk.toolCall) {
                        collectedToolCalls.push(chunk.toolCall);
                        yield { ...chunk, conversationId: conversation.id };
                    } else if (chunk.type === "content") {
                        contentSoFar += chunk.content || "";
                        fullContent += chunk.content || "";
                        yield { ...chunk, conversationId: conversation.id };
                    } else if (chunk.type === "done") {
                        gotDone = true;
                        if (chunk.usage) {
                            totalTokensIn += chunk.usage.inputTokens;
                            totalTokensOut += chunk.usage.outputTokens;
                        }
                        if (collectedToolCalls.length === 0) {
                            // Don't yield done — we yield run_end instead
                        }
                    } else if (chunk.type === "error") {
                        yield { ...chunk, conversationId: conversation.id };
                        await endRun(run.id, "failed");
                        yield { type: "run_end", runId: run.id, runStatus: "failed", conversationId: conversation.id };
                        return;
                    }
                }

                // If no tool calls, we're done
                if (collectedToolCalls.length === 0) {
                    break;
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

                // Execute all tool calls with autonomy
                for (const tc of collectedToolCalls) {
                    // Yield progress
                    yield {
                        type: "progress",
                        progressMessage: mapToolToProgressMessage(tc.name),
                        conversationId: conversation.id,
                    };

                    // Execute with autonomy (may yield artifact chunks)
                    const gen = this.executeToolWithAutonomy(tc, run.id, projectId || "global", conversation.id, userId);
                    let genResult = await gen.next();
                    while (!genResult.done) {
                        yield { ...genResult.value, conversationId: conversation.id };
                        genResult = await gen.next();
                    }
                    const toolResult = genResult.value;

                    // Yield tool result to client
                    yield { type: "tool_result", toolResult, conversationId: conversation.id };

                    // Add tool result message for next iteration
                    const toolMsg: AIMessage = {
                        id: `tool-result-${tc.id}`,
                        role: "tool",
                        content: JSON.stringify(toolResult.result ?? toolResult.error ?? ""),
                        toolResultId: tc.id,
                        createdAt: new Date().toISOString(),
                    };
                    currentMessages.push(toolMsg);
                }
            }

            // Save final AI text response to conversation
            if (fullContent) {
                await addMessageToConversation(conversation.id, {
                    role: "assistant",
                    content: fullContent,
                });
                await emitEvent(run.id, "message", { content: fullContent }, { messageRole: "assistant" });
            }

            // End run successfully
            await endRun(run.id, "completed", totalTokensIn, totalTokensOut);
            yield {
                type: "run_end",
                runId: run.id,
                runStatus: "completed",
                runCostTokensIn: totalTokensIn,
                runCostTokensOut: totalTokensOut,
                conversationId: conversation.id,
            };
        } catch (error) {
            // End run with failure
            await endRun(run.id, "failed");
            yield {
                type: "error",
                error: error instanceof Error ? error.message : "Unexpected error",
                conversationId: conversation.id,
            };
            yield { type: "run_end", runId: run.id, runStatus: "failed", conversationId: conversation.id };
        }
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
        const userId = options?.userId || "single-user"; // TODO: Replace with auth session lookup

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
        const userId = options?.userId || "single-user"; // TODO: Replace with auth session lookup

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

// ── Helper functions for tool → artifact mapping ────────────────────────────

/** Map tool name → artifact type (null if tool doesn't produce artifacts) */
function mapToolToArtifactType(toolName: string): ArtifactType | null {
    const mapping: Record<string, ArtifactType> = {
        search_pubmed: "study_proposal",
        add_to_ledger: "study_proposal",
        exclude_study: "study_proposal",
        extract_pdf: "study_proposal",
        bulk_screening: "screening_batch",
        update_criteria: "criteria_card",
        edit_draft: "draft_diff",
    };
    return mapping[toolName] ?? null;
}

/** Map tool name → human-readable artifact title */
function mapToolToArtifactTitle(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
        case "search_pubmed":
            return `PubMed: ${args.query ?? "search"}`;
        case "add_to_ledger":
            return `Add study: ${args.title ?? "study"}`;
        case "exclude_study":
            return `Exclude: ${args.title ?? "study"}`;
        case "extract_pdf":
            return `Extract: ${args.filename ?? "PDF"}`;
        case "bulk_screening":
            return "Batch screening results";
        case "update_criteria":
            return "Updated criteria";
        case "edit_draft":
            return `Draft: ${args.section ?? "section"}`;
        default:
            return toolName;
    }
}

/** Map tool name → progress message for streaming indicator */
function mapToolToProgressMessage(toolName: string): string {
    const messages: Record<string, string> = {
        search_pubmed: "Searching PubMed...",
        add_to_ledger: "Adding study to ledger...",
        exclude_study: "Excluding study...",
        extract_pdf: "Extracting PDF data...",
        bulk_screening: "Screening studies...",
        update_criteria: "Updating criteria...",
        edit_draft: "Writing draft...",
        retrieve_memory: "Retrieving memories...",
        create_note: "Creating note...",
    };
    return messages[toolName] ?? `Running ${toolName}...`;
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
