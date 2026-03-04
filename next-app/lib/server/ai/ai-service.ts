/**
 * AI Service
 * Central service for AI operations
 * Now with structured memory integration and tool execution loop
 */

import type { AIMessage, AIResponse, ChatOptions, AIStreamChunk, ConversationContext, ToolCall, ToolResult } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import { BaseAIProvider, getOpenAIProvider, getAnthropicProvider, getXAIProvider, getGoogleProvider } from "./providers";
import { getOrCreateConversation, addMessageToConversation, getConversationWithSummary, getConversationWithSummaryById, autoSummarizeIfNeeded } from "./memory";
import { validateRateLimits, recordUsage } from "./rate-limiter";
import { retrieveMemories, formatMemoriesForContext, markMemoriesUsedInAnswer, type RetrievedMemory } from "@/lib/server/memory";
import { AI_CONFIG, getProviderForModel, getContextBudget } from "@/lib/ai/config";
import {
    compactToolResult,
    compactLoopMessages,
    buildCompactedHistory,
    estimateMessagesTokensWithSafetyMargin,
    formatSummaryAsMessage,
    repairConversationHistory,
} from "@/lib/agent/compaction";
import { AVAILABLE_TOOLS, getToolDefinitions, executeTool } from "./tools";
import { startRun, endRun } from "@/lib/server/agent/run";
import { emitEvent } from "@/lib/server/agent/events";
import { createArtifact } from "@/lib/server/agent/artifacts";
import { getAutonomyConfig } from "@/lib/server/agent/autonomy";
import {
    assembleSystemPrompt,
    buildProjectContext,
    buildProtocolContext,
    buildProtocolPointerContext,
    buildLedgerContext,
    buildLedgerPointerContext,
    buildAutonomyContext,
    buildLocationContext,
    buildStudyContext,
} from "@/lib/ai/prompts/copilot-prompts";
import { normalizeAgentMode } from "@/lib/agent/feature-flags";
import { LoopState, type StopReason } from "@/lib/agent/loop-controller";
import { startRunTrace, startLLMGeneration, startContextSpan, flushTracing } from "./tracing";
import { withChoicesExtraction } from "./choices-extractor";
import { sanitizeGeneratedConversationTitle, buildFallbackConversationTitle } from "./title-generator";
import { detectScopingHandoffSelection, extractLatestScopingReport } from "./scoping";
import { prisma } from "@/lib/server/prisma";
import { isProtocolPopulated, type ProtocolData } from "@/types/protocol";
import type { ScopingReportPayload } from "@/types/artifacts";
import { ensureConversationRunAvailability } from "@/lib/server/chat-runtime/conversation-run-lock";
import { classifyAIError } from "./error-classification";
import { retryAsync, sleep } from "@/lib/server/utils/retry";
import { resolveReasoningMode } from "@/lib/ai/reasoning-visibility";
import { createIdempotencyMiddleware, executeWithToolMiddleware, type ToolExecutionRequest, type ToolMiddleware } from "./tool-middleware";
import { resolveAuthenticatedIdentity } from "@/lib/server/auth/identity";
import { computeLedgerCounts, computeStudyLedger } from "@/lib/server/ledger-utils";
import {
    mapToolToProgressMessage,
    isStudyLedgerSnapshot,
    getLedgerCounts,
    emptyLedgerCounts,
    buildScopingHandoffToolCall,
    getLazyContextPointerCapabilities,
    getContextualToolDefinitions,
    shouldUseScopingBatchPlan,
    buildScopingSearchPackPlan,
    finalizeScopingResponse,
} from "./tool-helpers";
import { executeToolWithAutonomy } from "./tool-autonomy";

const MAX_STREAM_RETRY_ATTEMPTS = 3;
const MAX_OVERFLOW_RECOVERY_ATTEMPTS = 3;
const RETRY_MIN_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 15_000;
const RETRY_JITTER = 0.15;

const PUSH_PROTOCOL_CONTEXT_MODES = new Set<AgentMode>(["protocol", "screening", "drafting"]);
const PUSH_LEDGER_CONTEXT_MODES = new Set<AgentMode>(["screening", "search"]);

type RunActualModelMeta = {
    actualModel: string | null;
    actualModelSource: "provider" | "requested" | "unknown";
};

function resolveRunActualModelMeta(
    requestedModel: string | undefined,
    providerModel: string | null,
    invokedModel: boolean,
): RunActualModelMeta {
    if (providerModel) {
        return { actualModel: providerModel, actualModelSource: "provider" };
    }
    if (invokedModel) {
        return {
            actualModel: requestedModel ?? AI_CONFIG.defaultModel,
            actualModelSource: "requested",
        };
    }
    return { actualModel: null, actualModelSource: "unknown" };
}

export type ToolRuntimeContext = {
    signal?: AbortSignal;
    systemContexts?: {
        projectContext?: string;
        protocolContext?: string;
        ledgerContext?: string;
        memoryContext?: string;
        autonomyContext?: string;
    };
    protocolData?: ProtocolData | null;
};

class AIService {
    private providers = new Map<string, BaseAIProvider>();
    private activeProviderId: string = AI_CONFIG.defaultProvider;
    private readonly toolMiddlewares: ToolMiddleware[];

    constructor(config?: { toolMiddlewares?: ToolMiddleware[] }) {
        this.toolMiddlewares = [...(config?.toolMiddlewares ?? [])];
        // Register all configured providers
        const openai = getOpenAIProvider();
        if (openai.isConfigured()) this.registerProvider(openai);

        const anthropic = getAnthropicProvider();
        if (anthropic.isConfigured()) this.registerProvider(anthropic);

        const xai = getXAIProvider();
        if (xai.isConfigured()) this.registerProvider(xai);

        const google = getGoogleProvider();
        if (google.isConfigured()) this.registerProvider(google);
    }

    registerToolMiddleware(middleware: ToolMiddleware): void {
        this.toolMiddlewares.push(middleware);
    }

    clearToolMiddlewares(): void {
        this.toolMiddlewares.length = 0;
    }

    async executeToolWithMiddleware(request: ToolExecutionRequest): Promise<ToolResult> {
        return executeWithToolMiddleware(
            request,
            this.toolMiddlewares,
            async (resolvedRequest) => executeTool(
                resolvedRequest.name,
                resolvedRequest.args,
                resolvedRequest.callId,
                resolvedRequest.context
            ),
        );
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
                        : providerId === "google" ? "GEMINI_API_KEY"
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
     * Reasoning policy is provider-agnostic.
     * Provider adapters are responsible for honoring includeReasoning when supported and
     * safely no-oping when unsupported.
     */
    private withProviderReasoningPolicy(
        options: ChatOptions | undefined
    ): ChatOptions {
        const hasExplicitReasoningPreference =
            options?.reasoningMode !== undefined || options?.includeReasoning !== undefined;
        const mode = hasExplicitReasoningPreference
            ? resolveReasoningMode(options?.reasoningMode, options?.includeReasoning)
            : "off";
        const includeReasoning = mode !== "off";
        return {
            ...(options ?? {}),
            reasoningMode: mode,
            includeReasoning,
            reasoningBudgetTokens: includeReasoning ? options?.reasoningBudgetTokens : undefined,
        };
    }

    private async maybeGenerateConversationTitle(params: {
        conversationId: string;
        projectId?: string;
        model?: string;
        historicalAssistantCount: number;
        firstUserMessage: string;
        assistantMessage: string;
    }): Promise<string | null> {
        const {
            conversationId,
            projectId,
            historicalAssistantCount,
            firstUserMessage,
            assistantMessage,
        } = params;

        // Only name a conversation on its first assistant reply.
        if (historicalAssistantCount > 0) return null;
        if (!assistantMessage.trim()) return null;
        if (!firstUserMessage.trim()) return null;

        const existing = await prisma.aIConversation.findUnique({
            where: { id: conversationId },
            select: { title: true },
        });
        if (!existing || existing.title) return null;

        const fallbackSeed = firstUserMessage || assistantMessage;
        let candidate = buildFallbackConversationTitle(fallbackSeed);

        try {
            const response = await this.chat(
                [
                    {
                        id: "title-system",
                        role: "system",
                        content: "Generate a concise conversation title. Max 8 words. No quotes. Return only the title text.",
                        createdAt: new Date().toISOString(),
                    },
                    {
                        id: "title-user",
                        role: "user",
                        content: `User message:\n${firstUserMessage.slice(0, 220)}\n\nAssistant response:\n${assistantMessage.slice(0, 220)}`,
                        createdAt: new Date().toISOString(),
                    },
                ],
                {
                    projectId,
                    model: "grok-4-1-fast",
                    temperature: 0.2,
                    maxTokens: 24,
                }
            );
            candidate = sanitizeGeneratedConversationTitle(response.content, fallbackSeed);
        } catch {
            // Fall back to deterministic truncation when title generation fails.
        }

        const updated = await prisma.aIConversation.updateMany({
            where: { id: conversationId, title: null },
            data: { title: candidate },
        });
        return updated.count > 0 ? candidate : null;
    }

    /**
     * Send a chat request
     */
    async chat(
        messages: AIMessage[],
        options?: ChatOptions
    ): Promise<AIResponse> {
        const identity = resolveAuthenticatedIdentity(options);
        const projectId = options?.projectId ?? null;
        const optionsWithAttribution = options as ChatOptions & { page?: string };

        // Validate rate limits
        await validateRateLimits({
            projectId,
            userId: identity.userId,
            workspaceId: identity.workspaceId ?? null,
        });

        const provider = this.resolveProvider(options?.model);
        const effectiveOptions = this.withProviderReasoningPolicy(options);
        const response = await retryAsync(
            () => provider.chat(messages, effectiveOptions),
            {
                attempts: MAX_STREAM_RETRY_ATTEMPTS,
                minDelayMs: RETRY_MIN_DELAY_MS,
                maxDelayMs: RETRY_MAX_DELAY_MS,
                jitter: RETRY_JITTER,
                signal: effectiveOptions?.signal,
                shouldRetry: (error) => classifyAIError(error).retryable,
                retryAfterMs: (error) => classifyAIError(error).retryAfterMs,
            }
        );

        // Record usage
        await recordUsage(
            projectId,
            response.model,
            response.usage.inputTokens,
            response.usage.outputTokens,
            {
                cachedInputTokens: response.usage.cachedInputTokens,
                userId: identity.userId,
                workspaceId: identity.workspaceId ?? null,
                source: projectId ? "project_copilot" : "ai_page",
                contextPage: optionsWithAttribution.page ?? (projectId ? "legacy_unknown" : "ai"),
                conversationId: options?.conversationId ?? null,
            },
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
        const identity = resolveAuthenticatedIdentity(options);
        const projectId = options?.projectId ?? null;
        const optionsWithAttribution = options as ChatOptions & { page?: string };

        // Validate rate limits
        await validateRateLimits({
            projectId,
            userId: identity.userId,
            workspaceId: identity.workspaceId ?? null,
        });

        const provider = this.resolveProvider(options?.model);
        const effectiveOptions = this.withProviderReasoningPolicy(options);

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCachedInputTokens = 0;
        let observedModel: string | null = null;

        for await (const chunk of provider.streamChat(messages, effectiveOptions)) {
            if (chunk.type === "done") {
                if (chunk.usage) {
                    totalInputTokens = chunk.usage.inputTokens;
                    totalOutputTokens = chunk.usage.outputTokens;
                    totalCachedInputTokens = chunk.usage.cachedInputTokens ?? 0;
                }
                if (typeof chunk.actualModel === "string" && chunk.actualModel.trim().length > 0) {
                    observedModel = chunk.actualModel;
                }
            }
            yield chunk;
        }

        const usageModel = observedModel ?? effectiveOptions?.model ?? AI_CONFIG.defaultModel;

        // Record usage after streaming completes
        await recordUsage(
            projectId,
            usageModel,
            totalInputTokens,
            totalOutputTokens,
            {
                cachedInputTokens: totalCachedInputTokens,
                userId: identity.userId,
                workspaceId: identity.workspaceId ?? null,
                source: projectId ? "project_copilot" : "ai_page",
                contextPage: optionsWithAttribution.page ?? (projectId ? "legacy_unknown" : "ai"),
                conversationId: options?.conversationId ?? null,
            },
        );
    }

    /**
     * Stream chat with tool execution loop.
     * Handles multiple tool calls per turn and loops until the AI finishes with text.
     * Tool-call/tool-result messages are kept in the local loop only — not persisted.
     * Uses LoopState for budget-aware control, repeat detection, and cancel support. (Phase 3)
     */
    async *streamChatWithTools(
        messages: AIMessage[],
        options?: ChatOptions
    ): AsyncIterable<AIStreamChunk> {
        const hasProjectScope = !!(options?.projectId && options.projectId !== null);
        const scope = hasProjectScope ? "project" as const : "global" as const;
        const toolDefs = getToolDefinitions(undefined, scope);
        if (toolDefs.length === 0) {
            yield* this.streamChat(messages, options);
            return;
        }

        const optionsWithTools: ChatOptions = { ...options, tools: toolDefs };
        const currentMessages = [...messages];
        const loop = new LoopState();
        const budget = getContextBudget(options?.model);

        while (true) {
            const check = loop.shouldContinue(options?.signal);
            if (!check.continue) {
                yield {
                    type: "done",
                    content: stopReasonMessage(check.stopReason),
                    stopReason: check.stopReason,
                };
                return;
            }

            const repaired = repairConversationHistory(currentMessages, { stopReason: "completed" });
            currentMessages.length = 0;
            currentMessages.push(...repaired.messages);

            // Pre-call budget check: compact if over budget before sending to model
            // `estimateMessagesTokensWithSafetyMargin` applies the 20% margin before we decide to compact.
            // `compactLoopMessages` itself remains raw-budget; this caller-side guard is the intended safety check.
            if (estimateMessagesTokensWithSafetyMargin(currentMessages) > budget) {
                const compacted = compactLoopMessages(currentMessages, budget);
                currentMessages.length = 0;
                currentMessages.push(...compacted.messages);
            }

            let collectedToolCalls: ToolCall[] = [];
            let contentSoFar = "";
            let retryCount = 0;
            let overflowRecoveryCount = 0;

            while (true) {
                collectedToolCalls = [];
                contentSoFar = "";
                let hadVisibleOutput = false;
                let retryAfterMs: number | undefined;
                let shouldRetry = false;
                let shouldRecoverOverflow = false;
                let terminalError: string | null = null;

                try {
                    for await (const chunk of this.streamChat(currentMessages, optionsWithTools)) {
                        if (chunk.type === "tool_call" && chunk.toolCall) {
                            hadVisibleOutput = true;
                            collectedToolCalls.push(chunk.toolCall);
                            yield chunk;
                        } else if (
                            chunk.type === "reasoning_start"
                            || chunk.type === "reasoning_delta"
                            || chunk.type === "reasoning_end"
                        ) {
                            hadVisibleOutput = true;
                            yield chunk;
                        } else if (chunk.type === "content") {
                            hadVisibleOutput = true;
                            contentSoFar += chunk.content || "";
                            yield chunk;
                        } else if (chunk.type === "done") {
                            if (collectedToolCalls.length === 0) {
                                loop.markStopped("natural");
                                yield chunk;
                            }
                        } else if (chunk.type === "error") {
                            const classified = classifyAIError(chunk);
                            const message = classified.message || chunk.error || "Unknown streaming error";
                            if (!hadVisibleOutput && classified.reason === "context_overflow" && overflowRecoveryCount < MAX_OVERFLOW_RECOVERY_ATTEMPTS) {
                                shouldRecoverOverflow = true;
                                break;
                            }
                            if (!hadVisibleOutput && classified.retryable && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
                                shouldRetry = true;
                                retryAfterMs = classified.retryAfterMs;
                                break;
                            }
                            terminalError = message;
                            break;
                        }
                    }
                } catch (error) {
                    const classified = classifyAIError(error);
                    if (!hadVisibleOutput && classified.reason === "context_overflow" && overflowRecoveryCount < MAX_OVERFLOW_RECOVERY_ATTEMPTS) {
                        shouldRecoverOverflow = true;
                    } else if (!hadVisibleOutput && classified.retryable && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
                        shouldRetry = true;
                        retryAfterMs = classified.retryAfterMs;
                    } else {
                        terminalError = classified.message || "Unknown streaming error";
                    }
                }

                if (shouldRecoverOverflow) {
                    overflowRecoveryCount += 1;
                    const compactedMessages = compactMessagesForOverflowRetry(currentMessages, budget);
                    currentMessages.length = 0;
                    currentMessages.push(...compactedMessages);
                    continue;
                }

                if (shouldRetry) {
                    retryCount += 1;
                    const delayMs = computeRetryDelayMs(retryCount, retryAfterMs);
                    await sleep(delayMs, options?.signal).catch(() => {});
                    if (options?.signal?.aborted) {
                        loop.markStopped("cancelled");
                        yield {
                            type: "done",
                            content: stopReasonMessage("cancelled"),
                            stopReason: "cancelled",
                        };
                        return;
                    }
                    continue;
                }

                if (terminalError) {
                    loop.markStopped("error");
                    yield { type: "error", error: terminalError };
                    return;
                }

                break;
            }

            if (collectedToolCalls.length === 0) {
                return;
            }

            // Check for repeated tool calls
            if (loop.recordToolCalls(collectedToolCalls)) {
                yield {
                    type: "done",
                    content: stopReasonMessage("repeat_detected"),
                    stopReason: "repeat_detected",
                };
                return;
            }

            const assistantMsg: AIMessage = {
                id: `tool-loop-assistant-${loop.iterations}`,
                role: "assistant",
                content: contentSoFar,
                toolCalls: collectedToolCalls,
                createdAt: new Date().toISOString(),
            };
            currentMessages.push(assistantMsg);

            for (const tc of collectedToolCalls) {
                const result = await this.executeToolWithMiddleware({
                    name: tc.name,
                    args: tc.arguments,
                    callId: tc.id,
                });
                yield { type: "tool_result", toolName: tc.name, toolResult: result };

                // ask_user sentinel: emit user_input_required and stop the loop
                if (result.requiresUserInput && result.userInputRequest) {
                    yield { type: "user_input_required", userInputRequest: result.userInputRequest };
                    loop.markStopped("paused_for_input");
                    return;
                }

                const toolMsg: AIMessage = {
                    id: `tool-result-${tc.id}`,
                    role: "tool",
                    content: compactToolResult(tc.name, result.result ?? result.error ?? ""),
                    toolResultId: tc.id,
                    createdAt: new Date().toISOString(),
                };
                currentMessages.push(toolMsg);
            }
        }
    }

    /**
     * Stream chat with artifacts and agent run lifecycle.
     * Wraps the tool execution loop with AgentRun creation, autonomy-aware
     * tool execution, and run lifecycle events.
     */
    async *streamChatWithArtifacts(
        userMessage: string,
        context: ConversationContext,
        options?: ChatOptions & {
            projectId?: string;
            studyId?: string;
            userId?: string;
            planId?: string;
            selectedSteps?: number[];
            agentMode?: AgentMode;
            page?: string;
            section?: string;
            /** When false, caller is responsible for persisting the user message (prevents double-writes). */
            persistUserMessage?: boolean;
            /** UI-persisted message content to drop from trailing history before appending augmented content. */
            persistedUserMessageContent?: string;
            /** ID of the UI-persisted user message for robust deduplication. */
            persistedUserMessageId?: string;
        }
    ): AsyncIterable<AIStreamChunk & { conversationId?: string }> {
        let projectId = options?.projectId;
        let studyId = options?.studyId;
        const identity = resolveAuthenticatedIdentity({
            userId: options?.userId,
            workspaceId: options?.workspaceId,
        });
        const userId = identity.userId;
        const workspaceId = identity.workspaceId;
        const requestedMode: AgentMode = (options?.agentMode as AgentMode) || "general";
        const agentMode: AgentMode = normalizeAgentMode(requestedMode);
        const executionMode = !!(options?.planId && options?.selectedSteps?.length);

        // Get or create conversation (with summary for compaction)
        // When conversationId is provided, load by ID and treat its scope as canonical.
        // This prevents cross-conversation writes when client scope drifts from the actual thread.
        let conversation;
        if (options?.conversationId) {
            const byId = await getConversationWithSummaryById(
                options.conversationId,
                userId,
                workspaceId,
            );
            if (byId) {
                conversation = byId;
                // Canonical ownership: conversation's stored scope is source of truth
                projectId = byId.projectId;
                studyId = byId.studyId;
            } else {
                throw new Error(`Invalid, archived, or inaccessible conversationId: ${options.conversationId}`);
            }
        } else {
            conversation = await getConversationWithSummary(
                context,
                projectId,
                studyId,
                workspaceId ? { userId, workspaceId } : undefined,
            );
        }
        const budget = getContextBudget(options?.model);

        // Coarse conversation-level lock: block overlapping fresh runs and
        // auto-cancel stale "running" rows left behind by interrupted sessions.
        await ensureConversationRunAvailability(conversation.id);

        // Start an agent run
        const run = await startRun({
            projectId: projectId || null,
            conversationId: conversation.id,
            userId,
            trigger: "user_message",
            agentMode,
            model: options?.model,
        });

        // Start Langfuse trace for this run
        const trace = startRunTrace(run.id, {
            projectId: projectId ?? "global",
            agentMode,
            model: options?.model,
            userId,
            conversationId: conversation.id,
        });

        // Yield run_start event
        yield { type: "run_start", runId: run.id, conversationId: conversation.id };

        // Emit user message event (skip for plan execution — no user message to record)
        if (!executionMode) {
            await emitEvent(run.id, "message", { content: userMessage }, { messageRole: "user" });
        }

        // Declared outside try so catch block can access them for plan finalization
        interface StepQueueEntry { originalIndex: number; toolName?: string; consumed: boolean; finalStatus: import("@/types/artifacts").PlanStep["status"] }
        let planData: { plan: import("@/types/artifacts").PlanPayload; selectedSteps: import("@/lib/server/agent/plan-execution").SelectedStep[] } | null = null;
        let stepQueue: StepQueueEntry[] = [];
        let fullContent = "";
        const historicalAssistantCount = conversation.messages.filter((m) => m.role === "assistant").length;
        const firstPersistedUserMessage = conversation.messages.find((m) => m.role === "user")?.content ?? "";
        let persistedUserContentForTitle = "";
        const latestScopingReport = agentMode === "scoping"
            ? extractLatestScopingReport(conversation.messages)
            : null;
        const handoffSelection = agentMode === "scoping"
            ? detectScopingHandoffSelection(userMessage, latestScopingReport)
            : null;
        const effectiveHandoffSelection = handoffSelection && projectId ? handoffSelection : null;
        let scopingSearchCallsThisRun = 0;
        let protocolHandoffExecuted = false;
        let scopingReportPayload: ScopingReportPayload | null = null;
        let retrievedMemoriesForRun: RetrievedMemory[] = [];

        try {
            // Retrieve memories + project context in parallel
            const ctxSpan = startContextSpan(trace, "context-assembly");
            const shouldPushProtocolContext = !!projectId && PUSH_PROTOCOL_CONTEXT_MODES.has(agentMode);
            const shouldPushLedgerContext = !!projectId && PUSH_LEDGER_CONTEXT_MODES.has(agentMode);
            const needsLedgerSeedMetadata = agentMode === "scoping";
            const needsFullLedgerSnapshot = shouldPushLedgerContext || needsLedgerSeedMetadata;

            const [retrievedMemories, protocolRow, studyLedger, autonomyConfig, studyRow, projectRow] = await Promise.all([
                retrieveMemories({ userId, projectId, studyId, conversationId: conversation.id, query: userMessage, agentMode, runId: run.id }),
                projectId ? prisma.protocol.findFirst({ where: { projectId }, select: { data: true } }) : null,
                projectId
                    ? (
                        needsFullLedgerSnapshot
                            ? computeStudyLedger(projectId)
                            : computeLedgerCounts(projectId)
                    )
                    : null,
                getAutonomyConfig(userId, projectId),
                studyId ? prisma.study.findUnique({ where: { id: studyId }, select: { id: true, title: true, authors: true, year: true, quality: true, details: true } }) : null,
                projectId ? prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }) : null,
            ]);
            retrievedMemoriesForRun = retrievedMemories;
            const memoriesContext = formatMemoriesForContext(retrievedMemories);
            const ledgerCounts = getLedgerCounts(studyLedger);
            ctxSpan.update({ output: {
                hasMemories: !!memoriesContext,
                hasProtocol: protocolRow?.data
                    ? isProtocolPopulated(protocolRow.data as unknown as ProtocolData)
                    : false,
                hasStudy: !!studyRow,
                studyLedger: ledgerCounts,
                hasProject: !!projectRow,
            }}).end();

            // Assemble context-aware system prompt (Phase 4.3)
            const projectContext = projectRow && projectId
                ? buildProjectContext(projectRow.name, projectId)
                : "";
            const pointerCapabilities = getLazyContextPointerCapabilities(agentMode);
            const protocolContext = projectId
                ? (
                    shouldPushProtocolContext
                        ? (
                            protocolRow?.data
                                ? buildProtocolContext(protocolRow.data as unknown as ProtocolData)
                                : ""
                        )
                        : buildProtocolPointerContext({ readToolAvailable: pointerCapabilities.canReadProtocol })
                )
                : "";
            const ledgerContext = projectId
                ? (
                    shouldPushLedgerContext
                        ? (
                            isStudyLedgerSnapshot(studyLedger)
                                ? buildLedgerContext(studyLedger.counts, studyLedger.list, studyLedger.truncated)
                                : buildLedgerContext(studyLedger ?? emptyLedgerCounts())
                        )
                        : buildLedgerPointerContext({ readToolAvailable: pointerCapabilities.canReadLedger })
                )
                : "";
            const autonomyContext = buildAutonomyContext(autonomyConfig.preset);
            const isGlobalAssistantScope = !projectId && options?.page === "ai";
            const scopeInstruction = isGlobalAssistantScope
                ? `\n\n[SCOPE]\nYou are operating in global AI command-center mode. You may compare and synthesize across projects when [ADDITIONAL_CONTEXT] includes multi-project data. If project-level details are missing, state what is unknown and suggest the next best step.`
                : "";
            const additionalContextMaxChars = isGlobalAssistantScope ? 3000 : 500;

            // Build study context from study metadata + details JSON
            let studyContext = "";
            if (studyRow) {
                const d = (studyRow.details ?? {}) as Record<string, unknown>;
                studyContext = buildStudyContext({
                    id: studyRow.id,
                    title: studyRow.title,
                    authors: studyRow.authors,
                    year: studyRow.year,
                    quality: studyRow.quality,
                    abstract: d.abstract as string | undefined,
                    doi: d.doi as string | undefined,
                    pmid: d.pmid as string | undefined,
                    journal: d.journal as string | undefined,
                    studyType: d.studyType as string | undefined,
                    keywords: d.keywords as string[] | undefined,
                    aiSummary: d.aiSummary as string | undefined,
                    qualityRationale: d.qualityRationale as string | undefined,
                    triageDecision: d.triageDecision as string | undefined,
                    sampleSize: d.sampleSize as number | undefined,
                    primaryOutcome: d.primaryOutcome as string | undefined,
                });
            }

            const systemPrompt = assembleSystemPrompt({
                agentMode,
                tone: options?.tone,
                scopeInstruction,
                projectContext,
                protocolContext,
                ledgerContext,
                locationContext: buildLocationContext(options?.page, options?.section),
                studyContext,
                memoryContext: memoriesContext || undefined,
                autonomyContext,
                additionalContext: options?.additionalContext,
                additionalContextMaxChars,
            })
            // Scoped to streamChatWithArtifacts only — not in global BASE_PROMPT
            // so PopupChat (which reuses AGENT_MODE_PROMPTS) doesn't emit choices without rendering support
            + `\n- When you ask a question that has a small number of clear options (2–5), or when suggesting specific next steps, end your response with a <choices> block. Each <choice> is a short actionable phrase the user can click. Only use this for genuine choices — not every response.\n  Format:\n  <choices>\n  <choice>Option text here</choice>\n  <choice icon="search">Search PubMed for related studies</choice>\n  </choices>\n  The optional icon attribute uses Material Icons names. The block must be the very last thing in your response.`;

            // Add user message to conversation (skip for plan execution)
            let userMsg: AIMessage | null = null;
            if (!executionMode && userMessage) {
                const shouldPersistUserMessage = options?.persistUserMessage !== false;
                if (shouldPersistUserMessage) {
                    const persistedUserContent = options?.persistedUserMessageContent || userMessage;
                    persistedUserContentForTitle = persistedUserContent;
                    userMsg = await addMessageToConversation(conversation.id, {
                        role: "user",
                        content: persistedUserContent,
                        attachments: options?.userMessageAttachments,
                    });
                } else {
                    userMsg = {
                        id: `ephemeral-user-${Date.now()}`,
                        role: "user",
                        content: userMessage,
                        createdAt: new Date().toISOString(),
                    };
                }
            }

            // Prepare messages with compacted history
            const summaryText = conversation.summaryData
                ? formatSummaryAsMessage(
                    conversation.summaryData.summary,
                    conversation.summaryData.keyPoints,
                    conversation.summaryData.decisions,
                    conversation.summaryData.followUpNeeded,
                    conversation.summaryData.messageCount
                )
                : null;
            const shouldPersistUserMessage = options?.persistUserMessage !== false;
            const baseHistory = [...conversation.messages];
            if (!shouldPersistUserMessage && options?.persistedUserMessageContent) {
                let removed = false;
                if (options.persistedUserMessageId) {
                    for (let index = baseHistory.length - 1; index >= 0; index--) {
                        if (baseHistory[index]?.id === options.persistedUserMessageId) {
                            baseHistory.splice(index, 1);
                            removed = true;
                            break;
                        }
                    }
                }
                if (!removed) {
                    const last = baseHistory[baseHistory.length - 1];
                    if (last?.role === "user" && last.content === options.persistedUserMessageContent) {
                        baseHistory.pop();
                    }
                }
            }
            const rawHistory = userMsg ? [...baseHistory, userMsg] : baseHistory;
            const compactedHistory = buildCompactedHistory(
                rawHistory,
                summaryText,
                conversation.summaryData?.messageCount ?? 0,
                budget
            );
            const historyMessages: AIMessage[] = [
                {
                    id: "system-prompt",
                    role: "system",
                    content: systemPrompt,
                    createdAt: new Date().toISOString(),
                },
                ...compactedHistory,
            ];

            const toolScope = projectId && projectId !== null ? "project" as const : "global" as const;
            const modeToolDefs = getContextualToolDefinitions({
                agentMode,
                scope: toolScope,
                studyLedger,
            });
            const modeToolNames = modeToolDefs.map((t) => t.name);

            if (effectiveHandoffSelection) {
                historyMessages.push({
                    id: "scoping-handoff",
                    role: "system",
                    content:
                        `The user selected scoping question #${effectiveHandoffSelection.index}: "${effectiveHandoffSelection.question}". ` +
                        `Immediately call update_protocol with field="researchQuestion", value exactly that question, ` +
                        `and rationale="Selected by user during scoping handoff". ` +
                        `Do not run search tools in this turn.`,
                    createdAt: new Date().toISOString(),
                });
            }

            if (!executionMode && shouldUseScopingBatchPlan({
                agentMode,
                userMessage,
                autonomyConfig,
            })) {
                const planPayload = buildScopingSearchPackPlan({
                    includeRecommendations: modeToolNames.includes("recommend_studies"),
                });
                const artifact = await createArtifact({
                    runId: run.id,
                    projectId: projectId || null,
                    conversationId: conversation.id,
                    userId,
                    type: "plan",
                    title: "Exploratory Search Pack",
                    payload: planPayload,
                });

                yield {
                    type: "artifact",
                    artifactId: artifact.id,
                    artifactType: "plan",
                    artifactStatus: "proposed",
                    artifactTitle: "Exploratory Search Pack",
                    artifactPayload: planPayload,
                    artifactVersion: 1,
                    conversationId: conversation.id,
                };

                await endRun(run.id, "completed");
                const runModelMeta = resolveRunActualModelMeta(options?.model, null, false);
                yield {
                    type: "run_end",
                    runId: run.id,
                    runStatus: "completed",
                    conversationId: conversation.id,
                    actualModel: runModelMeta.actualModel ?? undefined,
                    actualModelSource: runModelMeta.actualModelSource,
                };
                return;
            }

            // Check for multi-step workflow (plan-before-act)
            if (!options?.planId) {
                const { detectMultiStepWorkflow, generatePlan } = await import("@/lib/server/agent/planner");
                if (detectMultiStepWorkflow(userMessage, modeToolNames)) {
                    yield { type: "progress", progressMessage: "Creating a plan...", conversationId: conversation.id };

                    const planPayload = await generatePlan(userMessage, {
                        projectId: projectId ?? "global",
                        hasProtocol: protocolRow?.data
                            ? isProtocolPopulated(protocolRow.data as unknown as ProtocolData)
                            : false,
                        studyCount: getLedgerCounts(studyLedger)?.total ?? 0,
                    }, modeToolNames);

                    // If plan validation failed, skip plan artifact and continue normal chat
                    if (planPayload) {
                        const artifact = await createArtifact({
                            runId: run.id,
                            projectId: projectId || null,
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
                        const runModelMeta = resolveRunActualModelMeta(options?.model, null, false);
                        yield {
                            type: "run_end",
                            runId: run.id,
                            runStatus: "completed",
                            conversationId: conversation.id,
                            actualModel: runModelMeta.actualModel ?? undefined,
                            actualModelSource: runModelMeta.actualModelSource,
                        };
                        return;
                    }
                    // planPayload is null — validation failed, fall through to normal chat
                }
            }

            // ── Plan execution mode: load plan, inject execution instruction ──
            if (executionMode && options?.planId && options?.selectedSteps) {
                const { startPlanExecution } = await import("@/lib/server/agent/plan-execution");
                yield { type: "progress", progressMessage: "Starting plan execution...", conversationId: conversation.id };

                if (!projectId) {
                    throw new Error("Plan execution requires project context.");
                }
                planData = await startPlanExecution(options.planId, options.selectedSteps, projectId);

                // Build execution instruction
                const stepList = planData.selectedSteps
                    .map((s, i) => `${i + 1}. ${s.label}${s.toolName ? ` — tool: ${s.toolName}` : ""}${s.description ? ` — ${s.description}` : ""}`)
                    .join("\n");

                historyMessages.push({
                    id: "plan-execution-instruction",
                    role: "system",
                    content: `You are executing a pre-approved plan. Complete each step in order using the appropriate tools.\nDetermine tool arguments from the conversation context and protocol.\n\nSteps to execute:\n${stepList}\n\nAfter completing all steps, briefly summarize what was accomplished.`,
                    createdAt: new Date().toISOString(),
                });

                // Initialize step queue for tracking
                stepQueue = planData.selectedSteps.map(s => ({
                    originalIndex: s.originalIndex,
                    toolName: s.toolName,
                    consumed: false,
                    finalStatus: "pending" as const,
                }));
            }

            // Run the tool execution loop with autonomy
            const toolDefs = modeToolDefs;
            const chatOptions: ChatOptions = {
                ...options,
                projectId: projectId ?? undefined,
                ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
            };

            const currentMessages = [...historyMessages];
            let totalTokensIn = 0;
            let totalTokensOut = 0;
            let observedRunModel: string | null = null;
            let invokedModel = false;
            const loop = new LoopState();

            while (true) {
                const check = loop.shouldContinue(options?.signal);
                if (!check.continue) break;

                const repaired = repairConversationHistory(currentMessages, { stopReason: "completed" });
                currentMessages.length = 0;
                currentMessages.push(...repaired.messages);

                // Pre-call budget check: compact if over budget before sending to model
                // `estimateMessagesTokensWithSafetyMargin` applies the 20% margin before we decide to compact.
                // `compactLoopMessages` itself remains raw-budget; this caller-side guard is the intended safety check.
                if (estimateMessagesTokensWithSafetyMargin(currentMessages) > budget) {
                    const compacted = compactLoopMessages(currentMessages, budget);
                    currentMessages.length = 0;
                    currentMessages.push(...compacted.messages);
                    if (compacted.removed > 0) {
                        yield { type: "checkpoint", checkpointLabel: `Compacted ${compacted.removed} messages`, conversationId: conversation.id };
                    }
                }

                let collectedToolCalls: ToolCall[] = [];
                let contentSoFar = "";
                let retryCount = 0;
                let overflowRecoveryCount = 0;

                while (true) {
                    collectedToolCalls = [];
                    contentSoFar = "";
                    let hadVisibleOutput = false;
                    let retryAfterMs: number | undefined;
                    let shouldRetry = false;
                    let shouldRecoverOverflow = false;
                    let terminalError: string | null = null;

                    const genSpan = startLLMGeneration(trace, `llm-call-${loop.iterations}-attempt-${retryCount + 1}`, {
                        model: chatOptions.model,
                        inputMessageCount: currentMessages.length,
                        toolCount: toolDefs.length,
                    });

                    invokedModel = true;
                    const rawStream = this.streamChat(currentMessages, chatOptions);
                    try {
                        for await (const chunk of withChoicesExtraction(rawStream)) {
                            if (chunk.type === "tool_call" && chunk.toolCall) {
                                hadVisibleOutput = true;
                                collectedToolCalls.push(chunk.toolCall);
                                if (!(effectiveHandoffSelection && !protocolHandoffExecuted)) {
                                    yield { ...chunk, conversationId: conversation.id };
                                }
                            } else if (
                                chunk.type === "reasoning_start"
                                || chunk.type === "reasoning_delta"
                                || chunk.type === "reasoning_end"
                            ) {
                                hadVisibleOutput = true;
                                yield { ...chunk, conversationId: conversation.id };
                            } else if (chunk.type === "content") {
                                hadVisibleOutput = true;
                                contentSoFar += chunk.content || "";
                                fullContent += chunk.content || "";
                                yield { ...chunk, conversationId: conversation.id };
                            } else if (chunk.type === "choices" && chunk.choices) {
                                hadVisibleOutput = true;
                                yield { type: "choices", choices: chunk.choices, conversationId: conversation.id };
                            } else if (chunk.type === "done") {
                                if (chunk.usage) {
                                    totalTokensIn += chunk.usage.inputTokens;
                                    totalTokensOut += chunk.usage.outputTokens;
                                    genSpan.update({ usageDetails: { input: chunk.usage.inputTokens, output: chunk.usage.outputTokens } });
                                }
                                if (typeof chunk.actualModel === "string" && chunk.actualModel.trim().length > 0) {
                                    observedRunModel = chunk.actualModel;
                                }
                            } else if (chunk.type === "error") {
                                const classified = classifyAIError(chunk);
                                if (!hadVisibleOutput && classified.reason === "context_overflow" && overflowRecoveryCount < MAX_OVERFLOW_RECOVERY_ATTEMPTS) {
                                    shouldRecoverOverflow = true;
                                    break;
                                }
                                if (!hadVisibleOutput && classified.retryable && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
                                    shouldRetry = true;
                                    retryAfterMs = classified.retryAfterMs;
                                    break;
                                }
                                terminalError = classified.message || chunk.error || "Unknown streaming error";
                                break;
                            }
                        }
                    } catch (error) {
                        const classified = classifyAIError(error);
                        if (!hadVisibleOutput && classified.reason === "context_overflow" && overflowRecoveryCount < MAX_OVERFLOW_RECOVERY_ATTEMPTS) {
                            shouldRecoverOverflow = true;
                        } else if (!hadVisibleOutput && classified.retryable && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
                            shouldRetry = true;
                            retryAfterMs = classified.retryAfterMs;
                        } else {
                            terminalError = classified.message || "Unknown streaming error";
                        }
                    }
                    genSpan.end();

                    if (shouldRecoverOverflow) {
                        overflowRecoveryCount += 1;
                        const compactedMessages = compactMessagesForOverflowRetry(currentMessages, budget);
                        currentMessages.length = 0;
                        currentMessages.push(...compactedMessages);
                        yield {
                            type: "checkpoint",
                            checkpointLabel: `Recovered context overflow (attempt ${overflowRecoveryCount})`,
                            conversationId: conversation.id,
                        };
                        continue;
                    }

                    if (shouldRetry) {
                        retryCount += 1;
                        const delayMs = computeRetryDelayMs(retryCount, retryAfterMs);
                        await sleep(delayMs, options?.signal).catch(() => {});
                        if (options?.signal?.aborted) {
                            loop.markStopped("cancelled");
                            break;
                        }
                        continue;
                    }

                    if (terminalError) {
                        loop.markStopped("error");
                        yield { type: "error", error: terminalError, conversationId: conversation.id };
                        await endRun(run.id, "failed");
                        const runModelMeta = resolveRunActualModelMeta(chatOptions.model, observedRunModel, invokedModel);
                        yield {
                            type: "run_end",
                            runId: run.id,
                            runStatus: "failed",
                            stopReason: "error",
                            conversationId: conversation.id,
                            actualModel: runModelMeta.actualModel ?? undefined,
                            actualModelSource: runModelMeta.actualModelSource,
                        };
                        return;
                    }

                    break;
                }

                if (effectiveHandoffSelection && !protocolHandoffExecuted) {
                    const updateProtocolCall = collectedToolCalls.find((tc) => tc.name === "update_protocol");
                    collectedToolCalls = [
                        updateProtocolCall ?? buildScopingHandoffToolCall(effectiveHandoffSelection.question),
                    ];
                }

                if (collectedToolCalls.length === 0) {
                    loop.markStopped("natural");
                    break;
                }

                // Check for repeated tool calls
                if (loop.recordToolCalls(collectedToolCalls)) {
                    break; // repeat_detected — shouldContinue will catch it next iteration
                }

                const assistantMsg: AIMessage = {
                    id: `tool-loop-assistant-${loop.iterations}`,
                    role: "assistant",
                    content: contentSoFar,
                    toolCalls: collectedToolCalls,
                    createdAt: new Date().toISOString(),
                };
                currentMessages.push(assistantMsg);

                // Execute all tool calls with autonomy
                for (const tc of collectedToolCalls) {
                    if (
                        tc.name === "search_pubmed" ||
                        tc.name === "search_semantic_scholar" ||
                        tc.name === "search_openalex" ||
                        tc.name === "recommend_studies"
                    ) {
                        scopingSearchCallsThisRun += 1;
                    }

                    // Plan step tracking: match tool call to next unconsumed step
                    let matchedStep: StepQueueEntry | undefined;
                    if (executionMode) {
                        matchedStep = stepQueue.find(s => !s.consumed && s.toolName === tc.name);
                        if (matchedStep) {
                            matchedStep.consumed = true;
                            matchedStep.finalStatus = "running";
                            yield { type: "plan_step_update", planId: options!.planId!, stepIndex: matchedStep.originalIndex, stepStatus: "running", conversationId: conversation.id };
                        }
                    }

                    yield {
                        type: "progress",
                        progressMessage: mapToolToProgressMessage(tc.name),
                        conversationId: conversation.id,
                    };

                    const gen = executeToolWithAutonomy(
                        this,
                        tc,
                        run.id,
                        projectId,
                        conversation.id,
                        userId,
                        agentMode,
                        trace,
                        studyId,
                        autonomyConfig,
                        {
                            signal: options?.signal,
                            protocolData: (protocolRow?.data as ProtocolData | null) ?? null,
                            systemContexts: {
                                projectContext,
                                protocolContext,
                                ledgerContext,
                                memoryContext: memoriesContext || undefined,
                                autonomyContext,
                            },
                        },
                    );
                    let genResult = await gen.next();
                    while (!genResult.done) {
                        yield { ...genResult.value, conversationId: conversation.id };
                        genResult = await gen.next();
                    }
                    const toolResult = genResult.value;

                    if (effectiveHandoffSelection && tc.name === "update_protocol" && !toolResult.error) {
                        protocolHandoffExecuted = true;
                    }

                    // Plan step tracking: mark completed or failed based on tool result
                    if (executionMode && matchedStep) {
                        const stepStatus = toolResult.error ? "failed" : "completed";
                        matchedStep.finalStatus = stepStatus;
                        yield { type: "plan_step_update", planId: options!.planId!, stepIndex: matchedStep.originalIndex, stepStatus, conversationId: conversation.id };
                    }

                    yield { type: "tool_result", toolName: tc.name, toolResult, conversationId: conversation.id };

                    // ask_user sentinel: emit user_input_required and stop the loop
                    if (toolResult.requiresUserInput && toolResult.userInputRequest) {
                        yield { type: "user_input_required", userInputRequest: toolResult.userInputRequest, conversationId: conversation.id };
                        loop.markStopped("paused_for_input");
                        break;
                    }

                    // Emit navigate event when tool result includes a navigation URL
                    const navigateUrl = (toolResult.result as Record<string, unknown> | null)?.navigate;
                    if (typeof navigateUrl === "string" && navigateUrl) {
                        const navigateProjectId = (toolResult.result as Record<string, unknown>)?.projectId as string | undefined;
                        yield { type: "navigate", navigateUrl, navigateProjectId, conversationId: conversation.id };
                    }

                    const toolMsg: AIMessage = {
                        id: `tool-result-${tc.id}`,
                        role: "tool",
                        content: compactToolResult(tc.name, toolResult.result ?? toolResult.error ?? ""),
                        toolResultId: tc.id,
                        createdAt: new Date().toISOString(),
                    };
                    currentMessages.push(toolMsg);
                }

                if (effectiveHandoffSelection && protocolHandoffExecuted) {
                    loop.markStopped("natural");
                    break;
                }
            }

            // Determine final stop reason and run status
            let finalStopReason = loop.stopReason ?? "natural";
            let runStatus: "completed" | "cancelled" | "failed" | "paused" =
                finalStopReason === "cancelled" ? "cancelled"
                    : finalStopReason === "paused_for_input" ? "paused"
                        : "completed";

            // ── Plan execution finalization ──
            if (executionMode && options?.planId && planData) {
                const { completePlanExecution, failPlanExecution } = await import("@/lib/server/agent/plan-execution");

                // Mark unconsumed selected steps based on stop reason
                const terminalStatus = finalStopReason === "natural" ? "skipped" as const : "failed" as const;
                for (const step of stepQueue) {
                    if (!step.consumed) {
                        step.finalStatus = terminalStatus;
                        yield { type: "plan_step_update", planId: options.planId, stepIndex: step.originalIndex, stepStatus: terminalStatus, conversationId: conversation.id };
                    }
                }

                // Build final steps array with updated statuses
                const finalSteps = planData.plan.steps.map((s, i) => {
                    const queued = stepQueue.find(q => q.originalIndex === i);
                    return { ...s, status: queued?.finalStatus ?? s.status };
                });

                // Determine plan outcome: every selected step must complete.
                const allCompleted = stepQueue.length > 0 && stepQueue.every(s => s.finalStatus === "completed");
                if (!allCompleted || finalStopReason === "cancelled" || finalStopReason === "error") {
                    const reason = finalStopReason === "cancelled"
                        ? "Cancelled by user"
                        : finalStopReason === "error"
                            ? "Execution error"
                            : "Plan did not complete all selected steps";
                    await failPlanExecution(options.planId, finalSteps, reason);
                    if (finalStopReason !== "cancelled") {
                        runStatus = "failed";
                    }
                } else {
                    await completePlanExecution(options.planId, finalSteps);
                }
            }

            if (effectiveHandoffSelection && protocolHandoffExecuted && !fullContent.trim()) {
                fullContent = `Proposed protocol handoff for Question ${effectiveHandoffSelection.index}: "${effectiveHandoffSelection.question}". Review and accept the protocol proposal card to continue in Protocol mode.`;
                yield { type: "content", content: fullContent, conversationId: conversation.id };
            }

            const finalizedScoping = finalizeScopingResponse({
                agentMode,
                fullContent,
                userMessage,
                hasHandoffSelection: !!effectiveHandoffSelection,
            });
            fullContent = finalizedScoping.content;
            scopingReportPayload = finalizedScoping.report;

            // Save final AI text response to conversation
            if (fullContent) {
                await addMessageToConversation(conversation.id, {
                    role: "assistant",
                    content: fullContent,
                });
                await emitEvent(run.id, "message", { content: fullContent }, { messageRole: "assistant" });
                await markMemoriesUsedInAnswer(retrievedMemoriesForRun, fullContent).catch(() => {});

                if (!executionMode) {
                    const generatedTitle = await this.maybeGenerateConversationTitle({
                        conversationId: conversation.id,
                        projectId: projectId || undefined,
                        model: options?.model,
                        historicalAssistantCount,
                        firstUserMessage: firstPersistedUserMessage || persistedUserContentForTitle || userMessage,
                        assistantMessage: fullContent,
                    });
                    if (generatedTitle) {
                        yield {
                            type: "conversation_title",
                            conversationId: conversation.id,
                            conversationTitle: generatedTitle,
                        };
                    }
                }
            }

            if (scopingReportPayload) {
                const topic = scopingReportPayload.topic?.trim();
                const title = topic ? `Scoping: ${topic}`.slice(0, 120) : "Scoping Report";
                const artifact = await createArtifact({
                    runId: run.id,
                    projectId: projectId || null,
                    conversationId: conversation.id,
                    userId,
                    type: "scoping_report",
                    title,
                    payload: scopingReportPayload,
                });

                const finalized = await prisma.artifact.update({
                    where: { id: artifact.id },
                    data: {
                        status: "auto_applied",
                        appliedAt: new Date(),
                        applyId: artifact.id,
                    },
                });

                yield {
                    type: "artifact",
                    artifactId: artifact.id,
                    artifactType: "scoping_report",
                    artifactStatus: finalized.status,
                    artifactTitle: artifact.title,
                    artifactPayload: artifact.payload,
                    artifactVersion: artifact.version,
                    conversationId: conversation.id,
                };
            }

            // Trigger auto-summarization if conversation is growing large.
            // Awaited so the function can block when near budget (Vercel cuts fire-and-forget).
            const totalMsgs = conversation.messages.length + 2; // +user +assistant
            const currentTokens = estimateMessagesTokensWithSafetyMargin(conversation.messages);
            await autoSummarizeIfNeeded(
                conversation.id, totalMsgs,
                conversation.summaryData?.messageCount ?? 0,
                budget, currentTokens
            );

            // Finalize trace
            trace.update({ metadata: {
                stopReason: finalStopReason,
                iterations: loop.iterations,
                toolCalls: loop.totalToolCalls,
                totalTokensIn,
                totalTokensOut,
                scopingSearchCalls: scopingSearchCallsThisRun,
                protocolHandoffExecuted,
            }}).end();
            await flushTracing();

            await endRun(run.id, runStatus, totalTokensIn, totalTokensOut);
            const runModelMeta = resolveRunActualModelMeta(chatOptions.model, observedRunModel, invokedModel);
            yield {
                type: "run_end",
                runId: run.id,
                runStatus,
                runCostTokensIn: totalTokensIn,
                runCostTokensOut: totalTokensOut,
                stopReason: finalStopReason,
                iterationCount: loop.iterations,
                toolCallCount: loop.totalToolCalls,
                conversationId: conversation.id,
                actualModel: runModelMeta.actualModel ?? undefined,
                actualModelSource: runModelMeta.actualModelSource,
            };
        } catch (error) {
            const isAbortError =
                options?.signal?.aborted ||
                (error instanceof Error && error.name === "AbortError") ||
                (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError");

            if (isAbortError) {
                if (fullContent) {
                    await addMessageToConversation(conversation.id, {
                        role: "assistant",
                        content: fullContent,
                    });
                    await emitEvent(run.id, "message", { content: fullContent }, { messageRole: "assistant" });
                }

                trace.update({ metadata: { aborted: true } }).end();
                await flushTracing();
                await endRun(run.id, "cancelled");
                const runModelMeta = resolveRunActualModelMeta(options?.model, null, false);
                yield {
                    type: "run_end",
                    runId: run.id,
                    runStatus: "cancelled",
                    conversationId: conversation.id,
                    actualModel: runModelMeta.actualModel ?? undefined,
                    actualModelSource: runModelMeta.actualModelSource,
                };
                return;
            }

            // ── Plan execution failure finalization ──
            if (executionMode && options?.planId && planData) {
                try {
                    const { failPlanExecution } = await import("@/lib/server/agent/plan-execution");
                    for (const step of stepQueue) {
                        if (!step.consumed) step.finalStatus = "failed";
                    }
                    const finalSteps = planData.plan.steps.map((s, i) => {
                        const queued = stepQueue.find(q => q.originalIndex === i);
                        return { ...s, status: queued?.finalStatus ?? s.status };
                    });
                    await failPlanExecution(options.planId, finalSteps, error instanceof Error ? error.message : "Unknown error");
                } catch {
                    // Best-effort — don't mask the original error
                }
            }

            // End trace + run with failure
            trace.update({ metadata: { error: error instanceof Error ? error.message : "Unknown" } }).end();
            await flushTracing();

            await endRun(run.id, "failed");
            yield {
                type: "error",
                error: error instanceof Error ? error.message : "Unexpected error",
                conversationId: conversation.id,
            };
            const runModelMeta = resolveRunActualModelMeta(options?.model, null, false);
            yield {
                type: "run_end",
                runId: run.id,
                runStatus: "failed",
                conversationId: conversation.id,
                actualModel: runModelMeta.actualModel ?? undefined,
                actualModelSource: runModelMeta.actualModelSource,
            };
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
        const identity = resolveAuthenticatedIdentity({
            userId: options?.userId,
            workspaceId: options?.workspaceId,
        });
        const userId = identity.userId;
        const workspaceId = identity.workspaceId;

        // Get or create conversation
        const conversation = await getOrCreateConversation(
            context,
            projectId,
            studyId,
            workspaceId ? { userId, workspaceId } : undefined,
        );

        // Retrieve relevant memories
        const memories = await retrieveMemories({
            userId,
            projectId,
            studyId,
            conversationId: conversation.id,
            query: userMessage,
        });
        const memoriesContext = formatMemoriesForContext(memories);

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
            projectId: projectId ?? undefined,
        });

        // Save AI response to memory
        await addMessageToConversation(conversation.id, {
            role: "assistant",
            content: response.content,
        });
        await markMemoriesUsedInAnswer(memories, response.content).catch(() => {});

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
        const identity = resolveAuthenticatedIdentity({
            userId: options?.userId,
            workspaceId: options?.workspaceId,
        });
        const userId = identity.userId;
        const workspaceId = identity.workspaceId;

        // Get or create conversation
        const conversation = await getOrCreateConversation(
            context,
            projectId,
            studyId,
            workspaceId ? { userId, workspaceId } : undefined,
        );

        // Retrieve relevant memories
        const memories = await retrieveMemories({
            userId,
            projectId,
            studyId,
            conversationId: conversation.id,
            query: userMessage,
        });
        const memoriesContext = formatMemoriesForContext(memories);

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
            projectId: projectId ?? undefined,
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
            await markMemoriesUsedInAnswer(memories, fullContent).catch(() => {});
        }
    }
}

// ── Re-export pure helpers from tool-helpers.ts for backward compatibility ──
export {
    getLazyContextPointerCapabilities,
    getContextualToolDefinitions,
    shouldUseScopingBatchPlan,
    buildScopingSearchPackPlan,
    finalizeScopingResponse,
} from "./tool-helpers";

function computeRetryDelayMs(retryCount: number, retryAfterMs?: number): number {
    const exponentialDelay = RETRY_MIN_DELAY_MS * 2 ** Math.max(0, retryCount - 1);
    const baseDelay = typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)
        ? Math.max(retryAfterMs, RETRY_MIN_DELAY_MS)
        : exponentialDelay;
    const jitterOffset = (Math.random() * 2 - 1) * RETRY_JITTER;
    const jittered = Math.round(baseDelay * (1 + jitterOffset));
    return Math.min(Math.max(jittered, RETRY_MIN_DELAY_MS), RETRY_MAX_DELAY_MS);
}

function compactMessagesForOverflowRetry(messages: AIMessage[], budget: number): AIMessage[] {
    const compacted = compactLoopMessages(messages, budget);
    const trimmed = buildCompactedHistory(
        compacted.messages,
        null,
        0,
        Math.max(Math.floor(budget * 0.85), 2_000)
    );
    return repairConversationHistory(trimmed, { stopReason: "completed" }).messages;
}

// ── Loop stop reason messages ────────────────────────────────────────────────

function stopReasonMessage(reason: StopReason): string {
    const messages: Record<StopReason, string> = {
        natural: "",
        max_iterations: "I've reached the maximum number of iterations. Please try a more specific request.",
        max_tool_calls: "I've reached the maximum number of tool calls. Please try a more focused request.",
        wall_time: "This operation took too long. Please try a simpler request.",
        repeat_detected: "I noticed I was about to repeat the same action. Let me summarize what I found so far.",
        cancelled: "The operation was cancelled.",
        error: "An error occurred during processing.",
        paused_for_input: "I need your input before I can continue.",
    };
    return messages[reason];
}

// Singleton instance
let aiServiceInstance: AIService | null = null;

export function getAIService(): AIService {
    if (!aiServiceInstance) {
        aiServiceInstance = new AIService({
            toolMiddlewares: [createIdempotencyMiddleware()],
        });
    }
    return aiServiceInstance;
}

export { AIService };
