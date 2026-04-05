/**
 * AI Service
 * Central service for AI operations
 * Now with structured memory integration and tool execution loop
 */

import type {
    AIErrorEnvelope,
    AIMessage,
    AIResponse,
    ChatOptions,
    AIStreamChunk,
    ClarificationFallbackAction,
    ConversationContext,
    ToolCall,
    ToolResult,
    UserInputRequest,
} from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import type { ChatUnificationMetricType, ClarificationRuntimePayload } from "@/types/chat-unification";
import {
    AIErrorWithEnvelope,
    buildStreamErrorChunk,
    createPlanExecutionErrorEnvelope,
    envelopeFromStreamChunk,
} from "@/lib/ai/error-envelope";
import { buildFailureFallbackMessage, deriveRunOutcome, type RunFacts } from "@/lib/ai/run-outcome";
import { BaseAIProvider, getOpenAIProvider, getAnthropicProvider, getXAIProvider, getGoogleProvider } from "./providers";
import { getOrCreateConversation, addMessageToConversation, getConversationWithSummary, getConversationWithSummaryById, autoSummarizeIfNeeded } from "./memory";
import { validateRateLimits, recordUsage } from "./rate-limiter";
import { retrieveMemories, formatMemoriesForContext, markMemoriesUsedInAnswer, type RetrievedMemory } from "@/lib/server/memory";
import { AI_CONFIG, getProviderForModel, getContextBudget } from "@/lib/ai/config";
import {
    buildModelVisibleToolResultForTool,
    compactToolResult,
    compactLoopMessages,
    buildCompactedHistory,
    estimateMessagesTokensWithSafetyMargin,
    formatSummaryAsMessage,
    repairConversationHistory,
} from "@/lib/agent/compaction";
import { AVAILABLE_TOOLS, executeTool } from "./tools";
import {
    startRun,
    endRun,
    startRunHeartbeat,
    markRunAbnormalEndClassification,
    markRunFinalizationFailed,
    markRunFinalizationState,
    type RunHeartbeatController,
} from "@/lib/server/agent/run";
import { recordRunEvent } from "@/lib/server/agent/run-event-recorder";
import { createArtifact } from "@/lib/server/agent/artifacts";
import { getAutonomyConfig } from "@/lib/server/agent/autonomy";
import { buildExecutablePlanPayload } from "@/lib/server/agent/plan-payloads";
import {
    assertNextPlanToolCall,
    failPlanExecution,
    markPlanExecutionRunning,
    preparePlanExecution,
    resolvePlanExecutionToolNames,
    type PlanExecutionStepState,
    type PreparedPlanExecution,
} from "@/lib/server/agent/plan-execution";
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
} from "@/lib/ai/prompts/assistant-prompts";
import { normalizeAgentMode } from "@/lib/agent/feature-flags";
import { detectScopingEntryIntent } from "@/lib/agent/router";
import { LoopState, type StopReason } from "@/lib/agent/loop-controller";
import { startRunTrace, startLLMGeneration, startContextSpan, flushTracing } from "./tracing";
import { withChoicesExtraction } from "./choices-extractor";
import { sanitizeGeneratedConversationTitle, buildFallbackConversationTitle } from "./title-generator";
import { detectScopingHandoffSelection, extractLatestScopingReport, extractScopingReportFromText } from "./scoping";
import { prisma } from "@/lib/server/prisma";
import { isProtocolPopulated, type ProtocolData } from "@/types/protocol";
import type { ScopingReportPayload } from "@/types/artifacts";
import { ensureConversationRunAvailability } from "@/lib/server/chat-runtime/conversation-run-lock";
import { persistRecoveryAuthoritativeRuntimeEvent } from "@/lib/server/chat-runtime/persist-recovery-events";
import { classifyAIError, toAIErrorEnvelope } from "./error-classification";
import { retryAsync, sleep } from "@/lib/server/utils/retry";
import { resolveReasoningMode } from "@/lib/ai/reasoning-visibility";
import { createIdempotencyMiddleware, executeWithToolMiddleware, type ToolExecutionRequest, type ToolMiddleware } from "./tool-middleware";
import { createToolPrerequisiteMiddleware, evaluateToolPrerequisites } from "./tool-prerequisites";
import { resolveAuthenticatedIdentity } from "@/lib/server/auth/identity";
import { computeLedgerCounts, computeStudyLedger } from "@/lib/server/ledger-utils";
import { logServerError, logServerInfo, logServerWarn } from "@/lib/server/logging";
import { ingestChatUnificationMetric } from "@/lib/server/chat-unification-metrics";
import { deriveChatUnificationSurface } from "./chat-unification-runtime-metrics";
import {
    dropShadowedInvalidToolCalls,
    getToolCallRepeatKey,
    mapToolToProgressMessage,
    isStudyLedgerSnapshot,
    getLedgerCounts,
    emptyLedgerCounts,
    buildScopingHandoffToolCall,
    getLazyContextPointerCapabilities,
    getContextualToolDefinitions,
    shouldShowScopingSearchPackPreview,
    buildScopingSearchPackPlan,
    finalizeScopingResponse,
} from "./tool-helpers";
import { executeToolWithAutonomy } from "./tool-autonomy";
import {
    applySuccessfulScopingToolResult,
    buildScopingWorkflowInstruction,
    createInitialScopingWorkflowState,
    deriveScopingIterationToolDefs,
    deriveScopingWorkflowSnapshot,
    evaluateScopingSearchExecution,
    deriveScopingClarificationPolicy,
    type ScopingWorkflowState,
} from "./scoping-workflow";
import {
    evaluateClarificationRequest,
    hydrateClarificationControllerState,
    markClarificationProgress,
    resolveDecisionBoundaryKey,
    type ClarificationControllerState,
} from "./clarification-controller";

const MAX_STREAM_RETRY_ATTEMPTS = 3;
const MAX_OVERFLOW_RECOVERY_ATTEMPTS = 3;
const RETRY_MIN_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 15_000;
const RETRY_JITTER = 0.15;

const PUSH_PROTOCOL_CONTEXT_MODES = new Set<AgentMode>(["protocol", "screening", "drafting"]);
const PUSH_LEDGER_CONTEXT_MODES = new Set<AgentMode>(["screening", "search"]);
const CONTEXT_DEGRADED_DATABASE_LABEL = "Continuing with reduced context due to a temporary database issue.";
const CONTEXT_DEGRADED_GENERIC_LABEL = "Continuing with reduced context due to a temporary context-loading issue.";

type ContextBranchName =
    | "conversation"
    | "plan_execution"
    | "run_availability"
    | "autonomy_config"
    | "memories"
    | "protocol"
    | "ledger"
    | "study"
    | "project";
type ContextFailureClass =
    | "database_connection_timeout"
    | "database_connection_failed"
    | "semantic_timeout"
    | "unknown_context_failure";
type ContextBranchRecord = {
    branch: ContextBranchName;
    critical: boolean;
    durationMs: number;
    success: boolean;
    failureClass?: ContextFailureClass;
    errorMeta?: AIErrorEnvelope;
};

function normalizeContextFailure(error: unknown): { failureClass: ContextFailureClass; errorMeta: AIErrorEnvelope } {
    const fallbackMessage = error instanceof Error ? error.message : String(error);
    const errorMeta = toAIErrorEnvelope(error, {
        kind: "runtime",
        source: "runtime",
        message: fallbackMessage || "Context assembly failed.",
    });

    if (errorMeta.code === "DATABASE_CONNECTION_TIMEOUT") {
        return { failureClass: "database_connection_timeout", errorMeta };
    }
    if (errorMeta.code === "DATABASE_CONNECTION_FAILED" || errorMeta.kind === "database_connection") {
        return { failureClass: "database_connection_failed", errorMeta };
    }
    if (/semantic/i.test(errorMeta.message) && /timed?\s*out/i.test(errorMeta.message)) {
        return { failureClass: "semantic_timeout", errorMeta };
    }
    return { failureClass: "unknown_context_failure", errorMeta };
}

function logContextBranch(record: ContextBranchRecord, meta: {
    runId?: string | null;
    conversationId?: string | null;
    projectId?: string | null;
    agentMode?: AgentMode;
}) {
    const payload = {
        branch: record.branch,
        critical: record.critical,
        durationMs: record.durationMs,
        success: record.success,
        failureClass: record.failureClass ?? null,
        errorCode: record.errorMeta?.code ?? null,
        errorKind: record.errorMeta?.kind ?? null,
        runId: meta.runId ?? null,
        conversationId: meta.conversationId ?? null,
        projectId: meta.projectId ?? null,
        agentMode: meta.agentMode ?? null,
    };
    if (record.success) {
        logServerInfo("ai/context-assembly", "branch", payload);
    } else {
        logServerWarn("ai/context-assembly", "branch failed", payload);
    }
}

function logContextSummary(params: {
    records: ContextBranchRecord[];
    degraded: boolean;
    checkpointLabel?: string;
    runId?: string | null;
    conversationId?: string | null;
    projectId?: string | null;
    agentMode?: AgentMode;
}) {
    logServerInfo("ai/context-assembly", "summary", {
        degraded: params.degraded,
        checkpointLabel: params.checkpointLabel ?? null,
        successfulBranches: params.records.filter((record) => record.success).map((record) => record.branch),
        failedBranches: params.records.filter((record) => !record.success).map((record) => ({
            branch: record.branch,
            failureClass: record.failureClass ?? null,
            errorCode: record.errorMeta?.code ?? null,
        })),
        runId: params.runId ?? null,
        conversationId: params.conversationId ?? null,
        projectId: params.projectId ?? null,
        agentMode: params.agentMode ?? null,
    });
}

async function runCriticalContextBranch<T>(params: {
    branch: ContextBranchName;
    operation: () => Promise<T>;
    meta: {
        runId?: string | null;
        conversationId?: string | null;
        projectId?: string | null;
        agentMode?: AgentMode;
    };
}): Promise<{ value: T; record: ContextBranchRecord }> {
    const startedAt = Date.now();
    try {
        const value = await params.operation();
        const record: ContextBranchRecord = {
            branch: params.branch,
            critical: true,
            durationMs: Date.now() - startedAt,
            success: true,
        };
        logContextBranch(record, params.meta);
        return { value, record };
    } catch (error) {
        const normalized = normalizeContextFailure(error);
        const record: ContextBranchRecord = {
            branch: params.branch,
            critical: true,
            durationMs: Date.now() - startedAt,
            success: false,
            failureClass: normalized.failureClass,
            errorMeta: normalized.errorMeta,
        };
        logContextBranch(record, params.meta);
        throw error;
    }
}

async function runOptionalContextBranch<T>(params: {
    branch: ContextBranchName;
    operation: () => Promise<T>;
    meta: {
        runId?: string | null;
        conversationId?: string | null;
        projectId?: string | null;
        agentMode?: AgentMode;
    };
}): Promise<{ value: T; record: ContextBranchRecord } | { value: null; record: ContextBranchRecord }> {
    const startedAt = Date.now();
    try {
        const value = await params.operation();
        const record: ContextBranchRecord = {
            branch: params.branch,
            critical: false,
            durationMs: Date.now() - startedAt,
            success: true,
        };
        logContextBranch(record, params.meta);
        return { value, record };
    } catch (error) {
        const normalized = normalizeContextFailure(error);
        const record: ContextBranchRecord = {
            branch: params.branch,
            critical: false,
            durationMs: Date.now() - startedAt,
            success: false,
            failureClass: normalized.failureClass,
            errorMeta: normalized.errorMeta,
        };
        logContextBranch(record, params.meta);
        return { value: null, record };
    }
}

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

async function resolveToolRepeatKey(
    toolCall: ToolCall,
    context: ToolExecutionRequest["context"],
): Promise<string> {
    const prerequisiteEvaluation = await evaluateToolPrerequisites({
        name: toolCall.name,
        args: toolCall.arguments,
        callId: toolCall.id,
        context,
    });

    if (!prerequisiteEvaluation.allowed) {
        return prerequisiteEvaluation.repeatKey;
    }

    return getToolCallRepeatKey(toolCall);
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
    autonomyConfig?: {
        preset: string;
        toolOverrides: Record<string, unknown>;
    };
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
        const includeReasoning = mode === "full";
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
        const identity = resolveAuthenticatedIdentity(options);
        const hasProjectScope = !!(options?.projectId && options.projectId !== null);
        const scope = hasProjectScope ? "project" as const : "global" as const;
        const requestedMode: AgentMode = options?.agentMode || "general";
        const agentMode = normalizeAgentMode(requestedMode);
        const toolDefs = options?.tools ?? getContextualToolDefinitions({
            agentMode,
            scope,
            studyLedger: null,
            studyId: options?.studyId ?? null,
        });
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
                let terminalErrorChunk: AIStreamChunk | null = null;

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
                            const errorMeta = envelopeFromStreamChunk(chunk);
                            const classified = classifyAIError(errorMeta);
                            const message = classified.message || errorMeta.message || chunk.error || "Unknown streaming error";
                            if (!hadVisibleOutput && classified.reason === "context_overflow" && overflowRecoveryCount < MAX_OVERFLOW_RECOVERY_ATTEMPTS) {
                                shouldRecoverOverflow = true;
                                break;
                            }
                            if (!hadVisibleOutput && classified.retryable && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
                                shouldRetry = true;
                                retryAfterMs = classified.retryAfterMs;
                                break;
                            }
                            terminalErrorChunk = buildStreamErrorChunk({ ...errorMeta, message });
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
                        terminalErrorChunk = buildStreamErrorChunk(toAIErrorEnvelope(error, {
                            kind: "runtime",
                            source: "runtime",
                            message: classified.message || "Unknown streaming error",
                        }));
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

                if (terminalErrorChunk) {
                    loop.markStopped("error");
                    yield terminalErrorChunk;
                    return;
                }

                break;
            }

            if (collectedToolCalls.length === 0) {
                return;
            }

            const sanitizedToolCalls = dropShadowedInvalidToolCalls(collectedToolCalls);
            if (sanitizedToolCalls.dropped.length > 0) {
                logServerWarn("ai-service", "dropped malformed shadowed tool calls", {
                    droppedToolCalls: sanitizedToolCalls.dropped.map((toolCall) => ({
                        id: toolCall.id,
                        name: toolCall.name,
                        reason: toolCall.reason,
                    })),
                });
                collectedToolCalls = sanitizedToolCalls.toolCalls;
            }

            if (collectedToolCalls.length === 0) {
                return;
            }

            const repeatKeyedToolCalls = await Promise.all(collectedToolCalls.map(async (toolCall) => ({
                ...toolCall,
                repeatKey: await resolveToolRepeatKey(toolCall, {
                    projectId: options?.projectId,
                    studyId: options?.studyId,
                    userId: identity.userId,
                }),
            })));

            // Check for repeated tool calls
            if (loop.recordToolCalls(repeatKeyedToolCalls)) {
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
                    context: {
                        projectId: options?.projectId,
                        studyId: options?.studyId,
                        userId: identity.userId,
                    },
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
                    content: compactToolResult(tc.name, buildModelVisibleToolResultForTool(tc.name, result)),
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
            /**
             * Server-derived durable continuation seed. This is never trusted as
             * executable instruction text; it is authoritative runtime state for
             * resuming from an already-completed durable boundary.
             */
            continuationContext?: string;
        }
    ): AsyncIterable<AIStreamChunk & { conversationId?: string }> {
        let projectId = options?.projectId;
        let studyId = options?.studyId;
        let run: Awaited<ReturnType<typeof startRun>> | null = null;
        let runHeartbeat: RunHeartbeatController | null = null;
        let trace: ReturnType<typeof startRunTrace> | null = null;
        let runFinalized = false;
        let traceEnded = false;
        let finalizedRunStatus: "completed" | "failed" | "cancelled" | "paused" | null = null;
        const identity = resolveAuthenticatedIdentity({
            userId: options?.userId,
            workspaceId: options?.workspaceId,
        });
        const userId = identity.userId;
        const workspaceId = identity.workspaceId;
        const isStructuredClarificationResume = Boolean(options?.userInputResolution);
        const runtimeQueryText = (
            options?.userInputResolution?.answerText?.trim()
            || userMessage.trim()
        );
        const executionMode = !!(options?.planId && options?.selectedSteps?.length);
        const contextBranchRecords: ContextBranchRecord[] = [];
        let preparedPlanExecution: PreparedPlanExecution | null = null;
        if (executionMode && options?.planId && options?.selectedSteps) {
            const planExecutionResult = await runCriticalContextBranch({
                    branch: "plan_execution",
                    operation: () => preparePlanExecution(
                        options.planId!,
                        options.selectedSteps!,
                        projectId,
                    ),
                    meta: {
                        projectId: projectId ?? null,
                    },
                });
            contextBranchRecords.push(planExecutionResult.record);
            preparedPlanExecution = planExecutionResult.value;
            projectId = preparedPlanExecution.projectId ?? projectId;
        }
        const requestedMode: AgentMode = (
            preparedPlanExecution?.originAgentMode
            ?? (options?.agentMode as AgentMode)
        ) || "general";
        const agentMode: AgentMode = normalizeAgentMode(requestedMode);

        // Get or create conversation (with summary for compaction)
        // When conversationId is provided, load by ID and treat its scope as canonical.
        // This prevents cross-conversation writes when client scope drifts from the actual thread.
        const authoritativeConversationId = preparedPlanExecution?.conversationId ?? options?.conversationId;
        const conversationResult = await runCriticalContextBranch({
                branch: "conversation",
                operation: async () => {
                    if (authoritativeConversationId) {
                        const byId = await getConversationWithSummaryById(
                            authoritativeConversationId,
                            userId,
                            workspaceId,
                        );
                        if (!byId) {
                            throw new Error(`Invalid, archived, or inaccessible conversationId: ${authoritativeConversationId}`);
                        }
                        return byId;
                    }
                    return getConversationWithSummary(
                        context,
                        projectId,
                        studyId,
                        workspaceId ? { userId, workspaceId } : undefined,
                    );
                },
                meta: {
                    projectId: projectId ?? null,
                    agentMode,
                },
            });
        contextBranchRecords.push(conversationResult.record);
        const conversation = conversationResult.value;
        // Canonical ownership: conversation's stored scope is source of truth
        projectId = conversation.projectId;
        studyId = conversation.studyId;
        const budget = getContextBudget(options?.model);

        // Coarse conversation-level lock: block overlapping fresh runs and
        // auto-cancel stale "running" rows left behind by interrupted sessions.
        const runAvailabilityResult = await runCriticalContextBranch({
            branch: "run_availability",
            operation: () => ensureConversationRunAvailability(conversation.id, {
                replaceRunId: options?.replaceRunId,
            }),
            meta: {
                conversationId: conversation.id,
                projectId: projectId ?? null,
                agentMode,
            },
        });
        contextBranchRecords.push(runAvailabilityResult.record);

        // Declared outside try so catch block can access them for plan finalization
        const planData: PreparedPlanExecution | null = preparedPlanExecution;
        let stepQueue: PlanExecutionStepState[] = [];
        let fullContent = "";
        const historicalAssistantCount = conversation.messages.filter((m) => m.role === "assistant").length;
        const firstPersistedUserMessage = conversation.messages.find((m) => m.role === "user")?.content ?? "";
        let persistedUserContentForTitle = "";
        const latestScopingReport = agentMode === "scoping"
            ? extractLatestScopingReport(conversation.messages)
            : null;
        let effectiveHandoffSelection: { question: string; index: number } | null = null;
        let scopingWorkflow: ScopingWorkflowState | null = null;
        let scopingSearchCallsThisRun = 0;
        let protocolHandoffExecuted = false;
        let scopingReportPayload: ScopingReportPayload | null = null;
        let retrievedMemoriesForRun: RetrievedMemory[] = [];
        let clarificationControllerState: ClarificationControllerState =
            await hydrateClarificationControllerState({
                sourceRunId: options?.parentRunId ?? options?.continueFromRunId ?? null,
            });
        const surface = deriveChatUnificationSurface(options);
        const emitClarificationRuntimeMetric = async (
            type: ChatUnificationMetricType,
            payload: ClarificationRuntimePayload,
            runId?: string | null,
        ) => {
            if (!workspaceId) return;
            try {
                await ingestChatUnificationMetric(
                    { userId, workspaceId, role: "member" },
                    {
                        eventId: crypto.randomUUID(),
                        type,
                        surface,
                        runId: runId ?? null,
                        conversationId: conversation.id,
                        projectId: projectId ?? null,
                        payload,
                    },
                );
            } catch (error) {
                logServerWarn("ai-service", "failed to ingest clarification runtime metric", {
                    type,
                    runId: runId ?? null,
                    conversationId: conversation.id,
                    projectId: projectId ?? null,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        };
        const runFacts: RunFacts = {
            hadFinalAssistantAnswer: false,
            hadSuccessfulToolOrArtifact: false,
            hadDeterministicNonRetryableFailure: false,
            pausedForUserInput: false,
            cancelledByUser: false,
        };
        const finalizeRunOnce = async (
            status: "completed" | "failed" | "cancelled" | "paused",
            costTokensIn?: number,
            costTokensOut?: number,
        ) => {
            if (!run || runFinalized) return;
            runHeartbeat?.stop();
            runHeartbeat = null;
            await markRunFinalizationState(run.id, "in_progress");
            try {
                await endRun(run.id, status, costTokensIn, costTokensOut);
            } catch (error) {
                const activeRunId = run.id;
                await markRunFinalizationFailed(run.id).catch((markError) => {
                    logServerError("ai-service", "failed to persist finalization failure", {
                        runId: activeRunId,
                        error: markError,
                    });
                });
                throw error;
            }
            runFinalized = true;
            finalizedRunStatus = status;
        };
        const closeTraceOnce = async (metadata: Record<string, unknown>) => {
            if (!trace || traceEnded) return;
            trace.update({ metadata }).end();
            traceEnded = true;
            await flushTracing();
        };
        const persistRecoveryCheckpoint = async (checkpointLabel: string) => {
            if (!run?.id) return;
            await persistRecoveryAuthoritativeRuntimeEvent({
                runId: run.id,
                event: {
                    type: "checkpoint",
                    checkpointLabel,
                    conversationId: conversation.id,
                },
                failureMode: "degrade",
            });
        };
        const persistRecoveryUserInputRequest = async (userInputRequest: NonNullable<ToolResult["userInputRequest"]>) => {
            if (!run?.id) return;
            await persistRecoveryAuthoritativeRuntimeEvent({
                runId: run.id,
                event: {
                    type: "user_input_required",
                    userInputRequest,
                    conversationId: conversation.id,
                },
                failureMode: "strict",
            });
        };
        const persistRecoveryErrorChunk = async (chunk: AIStreamChunk) => {
            if (!run?.id || chunk.type !== "error") return;
            await persistRecoveryAuthoritativeRuntimeEvent({
                runId: run.id,
                event: {
                    type: "error",
                    error: chunk.error ?? "Unknown error",
                    errorMeta: chunk.errorMeta,
                    conversationId: conversation.id,
                },
                failureMode: "degrade",
            });
        };

        try {
            // Start an agent run inside the guarded lifecycle so early stream
            // termination still reaches exactly-one terminal finalization.
            run = await startRun({
                projectId: projectId || null,
                conversationId: conversation.id,
                userId,
                parentRunId: options?.parentRunId ?? options?.continueFromRunId,
                trigger: "user_message",
                agentMode,
                model: options?.model,
                initialPhase: options?.continuationContext ? "verify" : "plan",
            });
            const activeRun = run;
            runHeartbeat = startRunHeartbeat(activeRun.id, {
                onError: (error) => {
                    logServerWarn("ai/run-heartbeat", "failed", {
                        runId: activeRun.id,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });

            // Start Langfuse trace for this run.
            trace = startRunTrace(activeRun.id, {
                projectId: projectId ?? "global",
                agentMode,
                model: options?.model,
                userId,
                conversationId: conversation.id,
            });

            // Yield run_start event after the run is inside the guarded lifecycle.
            yield { type: "run_start", runId: activeRun.id, conversationId: conversation.id };

            // Emit user message event only for genuine new user turns, not structured clarification resumes.
            if (!executionMode && options?.persistUserMessage !== false) {
                await recordRunEvent({
                    runId: activeRun.id,
                    type: "message",
                    payload: { content: userMessage },
                    extras: { messageRole: "user" },
                    durabilityClass: "observability_only",
                    logContext: "user_message",
                });
            }

            // Establish critical runtime authority, then load optional context.
            const ctxSpan = startContextSpan(trace, "context-assembly");
            const shouldPushProtocolContext = !!projectId && PUSH_PROTOCOL_CONTEXT_MODES.has(agentMode);
            const shouldPushLedgerContext = !!projectId && PUSH_LEDGER_CONTEXT_MODES.has(agentMode);
            const needsLedgerSeedMetadata = agentMode === "scoping";
            const needsFullLedgerSnapshot = shouldPushLedgerContext || needsLedgerSeedMetadata;

            const contextMeta = {
                runId: activeRun.id,
                conversationId: conversation.id,
                projectId: projectId ?? null,
                agentMode,
            };

            const autonomyConfigResult = await runCriticalContextBranch({
                branch: "autonomy_config",
                operation: () => getAutonomyConfig(userId, projectId),
                meta: contextMeta,
            });
            contextBranchRecords.push(autonomyConfigResult.record);
            const autonomyConfig = autonomyConfigResult.value;

            const optionalBranchResults = await Promise.all([
                runOptionalContextBranch({
                    branch: "memories",
                    operation: () => retrieveMemories({
                        userId,
                        projectId,
                        studyId,
                        conversationId: conversation.id,
                        query: runtimeQueryText,
                        agentMode,
                        runId: activeRun.id,
                    }),
                    meta: contextMeta,
                }),
                runOptionalContextBranch({
                    branch: "protocol",
                    operation: () => projectId
                        ? prisma.protocol.findFirst({ where: { projectId }, select: { data: true } })
                        : Promise.resolve(null),
                    meta: contextMeta,
                }),
                runOptionalContextBranch({
                    branch: "ledger",
                    operation: async () => {
                        if (!projectId) return null;
                        if (needsFullLedgerSnapshot) {
                            return computeStudyLedger(projectId);
                        }
                        return computeLedgerCounts(projectId);
                    },
                    meta: contextMeta,
                }),
                runOptionalContextBranch({
                    branch: "study",
                    operation: () => studyId
                        ? prisma.study.findUnique({
                            where: { id: studyId },
                            select: { id: true, title: true, authors: true, year: true, quality: true, details: true },
                        })
                        : Promise.resolve(null),
                    meta: contextMeta,
                }),
                runOptionalContextBranch({
                    branch: "project",
                    operation: () => projectId
                        ? prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
                        : Promise.resolve(null),
                    meta: contextMeta,
                }),
            ]);

            const [memoriesResult, protocolResult, ledgerResult, studyResult, projectResult] = optionalBranchResults;
            contextBranchRecords.push(...optionalBranchResults.map((result) => result.record));

            const optionalFailures = optionalBranchResults.filter((result) => !result.record.success);
            const degradedCheckpointLabel = optionalFailures.length === 0
                ? null
                : optionalFailures.some((result) =>
                    result.record.failureClass === "database_connection_timeout"
                    || result.record.failureClass === "database_connection_failed")
                    ? CONTEXT_DEGRADED_DATABASE_LABEL
                    : CONTEXT_DEGRADED_GENERIC_LABEL;

            const retrievedMemories = memoriesResult.value ?? [];
            const protocolRow = protocolResult.value;
            const studyLedger = ledgerResult.value;
            const studyRow = studyResult.value;
            const projectRow = projectResult.value;

            retrievedMemoriesForRun = retrievedMemories;
            const memoriesContext = formatMemoriesForContext(retrievedMemories);
            const ledgerCounts = getLedgerCounts(studyLedger);
            const scopingEntryIntent = agentMode === "scoping"
                ? (
                    isStructuredClarificationResume
                        ? (latestScopingReport?.workflow?.entryIntent ?? "explore")
                        : detectScopingEntryIntent(userMessage, {
                            hasProtocol: protocolRow?.data
                                ? isProtocolPopulated(protocolRow.data as unknown as ProtocolData)
                                : false,
                        })
                )
                : "explore";
            const handoffSelection = agentMode === "scoping"
                ? detectScopingHandoffSelection(runtimeQueryText, latestScopingReport)
                : null;
            effectiveHandoffSelection = handoffSelection && projectId ? handoffSelection : null;
            scopingWorkflow = agentMode === "scoping"
                ? createInitialScopingWorkflowState({
                    entryIntent: scopingEntryIntent,
                    report: latestScopingReport,
                })
                : null;
            const ctxOutput = {
                hasMemories: !!memoriesContext,
                hasProtocol: protocolRow?.data
                    ? isProtocolPopulated(protocolRow.data as unknown as ProtocolData)
                    : false,
                hasStudy: !!studyRow,
                studyLedger: ledgerCounts,
                hasProject: !!projectRow,
                degraded: degradedCheckpointLabel !== null,
                checkpointLabel: degradedCheckpointLabel,
                branches: contextBranchRecords.map((record) => ({
                    branch: record.branch,
                    critical: record.critical,
                    success: record.success,
                    durationMs: record.durationMs,
                    failureClass: record.failureClass ?? null,
                    errorCode: record.errorMeta?.code ?? null,
                })),
            };
            ctxSpan.update({ output: ctxOutput }).end();
            logContextSummary({
                records: contextBranchRecords,
                degraded: degradedCheckpointLabel !== null,
                checkpointLabel: degradedCheckpointLabel ?? undefined,
                ...contextMeta,
            });
            if (degradedCheckpointLabel) {
                await persistRecoveryCheckpoint(degradedCheckpointLabel);
                yield {
                    type: "checkpoint",
                    checkpointLabel: degradedCheckpointLabel,
                    conversationId: conversation.id,
                };
            }

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
                continuationContext: options?.continuationContext,
                additionalContext: options?.additionalContext,
                additionalContextMaxChars,
            })
            + `\n- Process details such as search queries, result counts, and search refinement steps already have their own cards/checkpoints in the UI. In the visible answer, synthesize findings instead of repeating the process log. Only include exact queries or search-strategy details when the user explicitly asks for them.`
            // Scoped to streamChatWithArtifacts only — not in global BASE_PROMPT
            // so PopupChat (which reuses AGENT_MODE_PROMPTS) doesn't emit choices without rendering support
            + `\n- When suggesting optional next steps that the user can click for convenience, you may end your response with a <choices> block. Do not use <choices> for blocking questions or required decisions. If you need the user's answer before continuing, use ask_user instead.\n  Format:\n  <choices>\n  <choice>Option text here</choice>\n  <choice icon="search">Search PubMed for related studies</choice>\n  </choices>\n  The optional icon attribute uses Material Icons names. The block must be the very last thing in your response.`
            + `\n- ask_user runtime contract: ask at most one compact blocking clarification before durable progress. Include a recommended default whenever it is safe. Once a clarification is resolved, treat it as authoritative and continue; do not re-ask the same blocking question. If runtime policy prevents another blocking clarification, either use the safe recommended default, present one bounded terminal decision point, or stop truthfully.`;

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
                } else if (!options?.userInputResolution) {
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
                studyId: studyId ?? null,
            });
            const modeToolNames = modeToolDefs.map((t) => t.name);
            let executionToolDefs = modeToolDefs;

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

            if (!executionMode && !isStructuredClarificationResume && scopingWorkflow && shouldShowScopingSearchPackPreview({
                agentMode,
                userMessage,
                autonomyConfig,
                entryIntent: scopingWorkflow.entryIntent,
            })) {
                const planPayload = buildExecutablePlanPayload(buildScopingSearchPackPlan({
                    includeRecommendations: modeToolNames.includes("recommend_studies"),
                }), {
                    originAgentMode: agentMode,
                    conversationId: conversation.id,
                    projectId: projectId ?? null,
                    allowedToolNames: modeToolNames,
                });
                const artifact = await createArtifact({
                    runId: activeRun.id,
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
            }

            // Check for multi-step workflow (plan-before-act)
            if (!options?.planId && !isStructuredClarificationResume) {
                const { detectMultiStepWorkflow, generatePlan } = await import("@/lib/server/agent/planner");
                if (detectMultiStepWorkflow(userMessage, modeToolNames)) {
                    yield { type: "progress", progressMessage: "Creating a plan...", conversationId: conversation.id };

                    const rawPlanPayload = await generatePlan(userMessage, {
                        projectId: projectId ?? "global",
                        hasProtocol: protocolRow?.data
                            ? isProtocolPopulated(protocolRow.data as unknown as ProtocolData)
                            : false,
                        studyCount: getLedgerCounts(studyLedger)?.total ?? 0,
                    }, modeToolNames);

                    // If plan validation failed, skip plan artifact and continue normal chat
                    if (rawPlanPayload) {
                        const planPayload = buildExecutablePlanPayload(rawPlanPayload, {
                            originAgentMode: agentMode,
                            conversationId: conversation.id,
                            projectId: projectId ?? null,
                            allowedToolNames: modeToolNames,
                        });
                        const artifact = await createArtifact({
                            runId: activeRun.id,
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

                        await finalizeRunOnce("completed");
                        const runModelMeta = resolveRunActualModelMeta(options?.model, null, false);
                        yield {
                            type: "run_end",
                            runId: activeRun.id,
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
                yield { type: "progress", progressMessage: "Starting plan execution...", conversationId: conversation.id };

                if (!projectId) {
                    throw new AIErrorWithEnvelope(createPlanExecutionErrorEnvelope({
                        code: "PLAN_PROJECT_REQUIRED",
                        message: "Plan execution requires its original project context.",
                    }));
                }
                if (!planData) {
                    throw new AIErrorWithEnvelope(createPlanExecutionErrorEnvelope({
                        code: "PLAN_PREPARATION_MISSING",
                        message: "Plan execution context could not be prepared.",
                    }));
                }
                await markPlanExecutionRunning(options.planId);

                const resolvedExecutionTools = resolvePlanExecutionToolNames({
                    selectedSteps: planData.selectedSteps,
                    storedAllowedToolNames: planData.allowedToolNames,
                    currentAllowedToolNames: modeToolNames,
                });
                if (resolvedExecutionTools.unavailableToolNames.length > 0) {
                    throw new AIErrorWithEnvelope(createPlanExecutionErrorEnvelope({
                        code: "PLAN_SELECTED_TOOL_UNAVAILABLE",
                        message: `The approved plan references tool(s) that are no longer available in this mode: ${resolvedExecutionTools.unavailableToolNames.join(", ")}.`,
                    }));
                }

                executionToolDefs = modeToolDefs.filter((tool) =>
                    resolvedExecutionTools.allowedToolNames.includes(tool.name),
                );
                if (executionToolDefs.length === 0) {
                    throw new AIErrorWithEnvelope(createPlanExecutionErrorEnvelope({
                        code: "PLAN_TOOLSET_EMPTY",
                        message: "No approved executable tools remain available for this plan.",
                    }));
                }

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
                    label: s.label,
                    toolName: s.toolName!,
                    consumed: false,
                    finalStatus: "pending" as const,
                }));
            }

            // Run the tool execution loop with autonomy
            const baseChatOptions: ChatOptions = {
                ...options,
                projectId: projectId ?? undefined,
            };

            const currentMessages = [...historyMessages];
            let totalTokensIn = 0;
            let totalTokensOut = 0;
            let observedRunModel: string | null = null;
            let invokedModel = false;
            const loop = new LoopState();
            let forcedClarificationStop: {
                content: string;
                fallbackAction: ClarificationFallbackAction;
                reason: string;
            } | null = null;
            const scopingWorkflowMessageId = "scoping-workflow";

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
                        await persistRecoveryCheckpoint(`Compacted ${compacted.removed} messages`);
                        yield { type: "checkpoint", checkpointLabel: `Compacted ${compacted.removed} messages`, conversationId: conversation.id };
                    }
                }

                if (agentMode === "scoping" && scopingWorkflow) {
                    const existingWorkflowMessageIndex = currentMessages.findIndex((message) => message.id === scopingWorkflowMessageId);
                    if (existingWorkflowMessageIndex >= 0) {
                        currentMessages.splice(existingWorkflowMessageIndex, 1);
                    }
                    currentMessages.push({
                        id: scopingWorkflowMessageId,
                        role: "system",
                        content: buildScopingWorkflowInstruction(scopingWorkflow),
                        createdAt: new Date().toISOString(),
                    });
                }

                const iterationToolDefs = executionMode
                    ? executionToolDefs
                    : (
                        agentMode === "scoping" && scopingWorkflow
                            ? deriveScopingIterationToolDefs(modeToolDefs, scopingWorkflow)
                            : modeToolDefs
                    );
                const iterationChatOptions: ChatOptions = {
                    ...baseChatOptions,
                    ...(iterationToolDefs.length > 0 ? { tools: iterationToolDefs } : {}),
                };

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
                    let terminalErrorChunk: AIStreamChunk | null = null;
                    let terminalClassifiedError: ReturnType<typeof classifyAIError> | null = null;

                    const genSpan = startLLMGeneration(trace, `llm-call-${loop.iterations}-attempt-${retryCount + 1}`, {
                        model: iterationChatOptions.model,
                        inputMessageCount: currentMessages.length,
                        toolCount: iterationToolDefs.length,
                    });

                    invokedModel = true;
                    const rawStream = this.streamChat(currentMessages, iterationChatOptions);
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
                                const errorMeta = envelopeFromStreamChunk(chunk);
                                const classified = classifyAIError(errorMeta);
                                if (!hadVisibleOutput && classified.reason === "context_overflow" && overflowRecoveryCount < MAX_OVERFLOW_RECOVERY_ATTEMPTS) {
                                    shouldRecoverOverflow = true;
                                    break;
                                }
                                if (!hadVisibleOutput && classified.retryable && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
                                    shouldRetry = true;
                                    retryAfterMs = classified.retryAfterMs;
                                    break;
                                }
                                terminalErrorChunk = buildStreamErrorChunk(
                                    {
                                        ...errorMeta,
                                        message: classified.message || errorMeta.message || chunk.error || "Unknown streaming error",
                                    },
                                    { conversationId: conversation.id },
                                );
                                terminalClassifiedError = classified;
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
                            terminalErrorChunk = buildStreamErrorChunk(
                                toAIErrorEnvelope(error, {
                                    kind: "runtime",
                                    source: "runtime",
                                    message: classified.message || "Unknown streaming error",
                                }),
                                { conversationId: conversation.id },
                            );
                            terminalClassifiedError = classified;
                        }
                    }
                    genSpan.end();

                    if (shouldRecoverOverflow) {
                        overflowRecoveryCount += 1;
                        const compactedMessages = compactMessagesForOverflowRetry(currentMessages, budget);
                        currentMessages.length = 0;
                        currentMessages.push(...compactedMessages);
                        await persistRecoveryCheckpoint(`Recovered context overflow (attempt ${overflowRecoveryCount})`);
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

                    if (terminalErrorChunk) {
                        if (terminalClassifiedError && !terminalClassifiedError.retryable) {
                            runFacts.hadDeterministicNonRetryableFailure = true;
                        }
                        if (
                            terminalClassifiedError
                            && !terminalClassifiedError.retryable
                            && !fullContent.trim()
                            && !runFacts.hadSuccessfulToolOrArtifact
                        ) {
                            const fallbackContent = buildFailureFallbackMessage(terminalClassifiedError.message);
                            fullContent = fallbackContent;
                            runFacts.hadFinalAssistantAnswer = true;
                            await addMessageToConversation(conversation.id, {
                                role: "assistant",
                                content: fallbackContent,
                            });
                            await recordRunEvent({
                                runId: activeRun.id,
                                type: "message",
                                payload: { content: fallbackContent },
                                extras: { messageRole: "assistant" },
                                failureMode: "degrade",
                                degradationReason: "assistant_message_persistence_failed",
                                logContext: "assistant_message_fallback",
                            });
                            yield { type: "content", content: fallbackContent, conversationId: conversation.id };
                        }
                        loop.markStopped("error");
                        await persistRecoveryErrorChunk(terminalErrorChunk);
                        yield terminalErrorChunk;
                        await finalizeRunOnce("failed");
                        const runModelMeta = resolveRunActualModelMeta(iterationChatOptions.model, observedRunModel, invokedModel);
                        yield {
                            type: "run_end",
                            runId: activeRun.id,
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

                const sanitizedToolCalls = dropShadowedInvalidToolCalls(collectedToolCalls);
                if (sanitizedToolCalls.dropped.length > 0) {
                    logServerWarn("ai-service", "dropped malformed shadowed tool calls", {
                        droppedToolCalls: sanitizedToolCalls.dropped.map((toolCall) => ({
                            id: toolCall.id,
                            name: toolCall.name,
                            reason: toolCall.reason,
                        })),
                    });
                    collectedToolCalls = sanitizedToolCalls.toolCalls;
                }

                if (collectedToolCalls.length === 0) {
                    loop.markStopped("natural");
                    break;
                }

                const repeatKeyedToolCalls = await Promise.all(collectedToolCalls.map(async (toolCall) => ({
                    ...toolCall,
                    repeatKey: await resolveToolRepeatKey(toolCall, {
                        projectId,
                        studyId,
                        userId,
                        runId: activeRun.id,
                        protocolData: (protocolRow?.data as ProtocolData | null) ?? null,
                    }),
                })));

                // Check for repeated tool calls
                if (loop.recordToolCalls(repeatKeyedToolCalls)) {
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
                    if (agentMode === "scoping" && scopingWorkflow) {
                        const searchDecision = evaluateScopingSearchExecution(scopingWorkflow, tc.name);
                        if (!searchDecision.allow) {
                            scopingWorkflow = searchDecision.nextState;
                            currentMessages.push(
                                buildSyntheticScopingToolMessage(tc, searchDecision.toolResult)
                            );
                            currentMessages.push(
                                buildScopingCorrectionSystemMessage(searchDecision.correctiveMessage)
                            );
                            continue;
                        }
                    }

                    if (
                        tc.name === "search_pubmed" ||
                        tc.name === "search_semantic_scholar" ||
                        tc.name === "search_openalex" ||
                        tc.name === "recommend_studies"
                    ) {
                        scopingSearchCallsThisRun += 1;
                    }

                    // Plan step tracking: match tool call to next unconsumed step
                    let matchedStep: PlanExecutionStepState | undefined;
                    if (executionMode) {
                        matchedStep = assertNextPlanToolCall(stepQueue, tc.name);
                        matchedStep.consumed = true;
                        matchedStep.finalStatus = "running";
                        yield { type: "plan_step_update", planId: options!.planId!, stepIndex: matchedStep.originalIndex, stepStatus: "running", conversationId: conversation.id };
                    }

                    yield {
                        type: "progress",
                        progressMessage: mapToolToProgressMessage(tc.name),
                        conversationId: conversation.id,
                    };

                    const gen = executeToolWithAutonomy(
                        this,
                        tc,
                        activeRun.id,
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

                    if (toolResult.error) {
                        const classifiedToolError = classifyAIError(toolResult.errorMeta ?? toolResult.error);
                        if (!classifiedToolError.retryable) {
                            runFacts.hadDeterministicNonRetryableFailure = true;
                        }
                    } else if (tc.name !== "ask_user") {
                        runFacts.hadSuccessfulToolOrArtifact = true;
                        clarificationControllerState = markClarificationProgress(clarificationControllerState);
                        if (agentMode === "scoping" && scopingWorkflow) {
                            scopingWorkflow = applySuccessfulScopingToolResult(scopingWorkflow, tc.name, toolResult);
                        }
                    }

                    // ask_user sentinel: emit user_input_required and stop the loop
                    if (toolResult.requiresUserInput && toolResult.userInputRequest) {
                        const resolvedUserInputRequest = {
                            ...toolResult.userInputRequest,
                            sourceRunId: activeRun.id,
                            decisionBoundaryKey: toolResult.userInputRequest.decisionBoundaryKey
                                ?? resolveDecisionBoundaryKey({
                                    decisionBoundaryKey: toolResult.userInputRequest.decisionBoundaryKey ?? null,
                                    question: toolResult.userInputRequest.question,
                                }),
                        };
                        let scopingClarificationPolicyOverride = undefined;
                        if (agentMode === "scoping" && scopingWorkflow) {
                            const scopingClarificationPolicy = deriveScopingClarificationPolicy({
                                state: scopingWorkflow,
                                userInputRequest: resolvedUserInputRequest,
                            });
                            scopingWorkflow = scopingClarificationPolicy.nextState;
                            scopingClarificationPolicyOverride = scopingClarificationPolicy.policyOverride;
                        }

                        const clarificationDecision = evaluateClarificationRequest({
                            state: clarificationControllerState,
                            userInputRequest: resolvedUserInputRequest,
                            policyOverride: scopingClarificationPolicyOverride,
                        });
                        clarificationControllerState = clarificationDecision.nextState;
                        if (!clarificationDecision.allowPause) {
                            const suppressedToolResult = {
                                ...clarificationDecision.toolResult,
                                callId: tc.id,
                            };
                            yield {
                                type: "tool_result",
                                toolName: tc.name,
                                toolResult: suppressedToolResult,
                                conversationId: conversation.id,
                            };
                            const suppressionMetricType: ChatUnificationMetricType =
                                clarificationDecision.reason === "repeat_without_progress"
                                    ? "ask_user_same_boundary_suppressed"
                                    : "ask_user_budget_exhausted";
                            await emitClarificationRuntimeMetric(
                                suppressionMetricType,
                                {
                                    resolution: null,
                                    decisionBoundaryKey: resolvedUserInputRequest.decisionBoundaryKey ?? null,
                                    fallbackAction: clarificationDecision.fallbackAction,
                                    reason: clarificationDecision.reason,
                                },
                                activeRun.id,
                            );
                            if (clarificationDecision.fallbackAction === "use_recommended_default") {
                                await emitClarificationRuntimeMetric(
                                    "ask_user_recommended_default_used",
                                    {
                                        resolution: null,
                                        decisionBoundaryKey: resolvedUserInputRequest.decisionBoundaryKey ?? null,
                                        fallbackAction: clarificationDecision.fallbackAction,
                                        reason: clarificationDecision.reason,
                                    },
                                    activeRun.id,
                                );
                            }
                            if (clarificationDecision.fallbackAction !== "use_recommended_default") {
                                forcedClarificationStop = {
                                    content: buildClarificationForcedStopMessage({
                                        fallbackAction: clarificationDecision.fallbackAction,
                                        userInputRequest: resolvedUserInputRequest,
                                    }),
                                    fallbackAction: clarificationDecision.fallbackAction,
                                    reason: clarificationDecision.reason,
                                };
                                runFacts.hadDeterministicNonRetryableFailure = true;
                                loop.markStopped("error");
                                break;
                            }
                            currentMessages.push(
                                buildSyntheticScopingToolMessage(tc, suppressedToolResult)
                            );
                            currentMessages.push(
                                buildClarificationCorrectionSystemMessage(clarificationDecision.correctiveMessage)
                            );
                            continue;
                        }

                        const pausedToolResult = {
                            ...toolResult,
                            userInputRequest: resolvedUserInputRequest,
                        };

                        yield { type: "tool_result", toolName: tc.name, toolResult: pausedToolResult, conversationId: conversation.id };
                        runFacts.pausedForUserInput = true;
                        await persistRecoveryUserInputRequest(resolvedUserInputRequest);
                        yield { type: "user_input_required", userInputRequest: resolvedUserInputRequest, conversationId: conversation.id };
                        loop.markStopped("paused_for_input");
                        break;
                    }

                    yield { type: "tool_result", toolName: tc.name, toolResult, conversationId: conversation.id };

                    // Emit navigate event when tool result includes a navigation URL
                    const navigateUrl = (toolResult.result as Record<string, unknown> | null)?.navigate;
                    if (typeof navigateUrl === "string" && navigateUrl) {
                        const navigateProjectId = (toolResult.result as Record<string, unknown>)?.projectId as string | undefined;
                        yield { type: "navigate", navigateUrl, navigateProjectId, conversationId: conversation.id };
                    }

                    const toolMsg: AIMessage = {
                        id: `tool-result-${tc.id}`,
                        role: "tool",
                        content: compactToolResult(tc.name, buildModelVisibleToolResultForTool(tc.name, toolResult)),
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

            // ── Plan execution finalization ──
            if (executionMode && options?.planId && planData) {
                const { completePlanExecution } = await import("@/lib/server/agent/plan-execution");

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
                    if (finalStopReason !== "cancelled" && finalStopReason !== "paused_for_input") {
                        runFacts.hadDeterministicNonRetryableFailure = true;
                    }
                } else {
                    await completePlanExecution(options.planId, finalSteps);
                    runFacts.hadSuccessfulToolOrArtifact = true;
                }
            }

            if (effectiveHandoffSelection && protocolHandoffExecuted && !fullContent.trim()) {
                fullContent = `Proposed protocol handoff for Question ${effectiveHandoffSelection.index}: "${effectiveHandoffSelection.question}". Review and accept the protocol proposal card to continue in Protocol mode.`;
                yield { type: "content", content: fullContent, conversationId: conversation.id };
            }

            if (forcedClarificationStop) {
                fullContent = forcedClarificationStop.content;
                await markRunAbnormalEndClassification(activeRun.id, "no_forward_durable_progress").catch((markError) => {
                    logServerWarn("ai-service", "failed to persist clarification stop abnormal-end classification", {
                        runId: activeRun.id,
                        error: markError instanceof Error ? markError.message : String(markError),
                    });
                });
            } else {
                const scopingReportForSnapshot =
                    agentMode === "scoping"
                        ? extractScopingReportFromText(fullContent)
                        : null;
                const finalizedScoping = finalizeScopingResponse({
                    agentMode,
                    fullContent,
                    userMessage,
                    hasHandoffSelection: !!effectiveHandoffSelection,
                    workflowSnapshot:
                        agentMode === "scoping" && scopingWorkflow
                            ? deriveScopingWorkflowSnapshot(scopingWorkflow, scopingReportForSnapshot)
                            : undefined,
                });
                fullContent = finalizedScoping.content;
                scopingReportPayload = finalizedScoping.report;
            }

            // Save final AI text response to conversation
            if (fullContent) {
                runFacts.hadFinalAssistantAnswer = true;
                if (forcedClarificationStop) {
                    yield { type: "content", content: fullContent, conversationId: conversation.id };
                }
                await addMessageToConversation(conversation.id, {
                    role: "assistant",
                    content: fullContent,
                });
                await recordRunEvent({
                    runId: activeRun.id,
                    type: "message",
                    payload: { content: fullContent },
                    extras: { messageRole: "assistant" },
                    failureMode: "degrade",
                    degradationReason: "assistant_message_persistence_failed",
                    logContext: "assistant_message_final",
                });
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
            } else if (runFacts.hadDeterministicNonRetryableFailure && !runFacts.hadSuccessfulToolOrArtifact) {
                fullContent = buildFailureFallbackMessage(stopReasonMessage(finalStopReason as StopReason));
                runFacts.hadFinalAssistantAnswer = true;
                await addMessageToConversation(conversation.id, {
                    role: "assistant",
                    content: fullContent,
                });
                await recordRunEvent({
                    runId: activeRun.id,
                    type: "message",
                    payload: { content: fullContent },
                    extras: { messageRole: "assistant" },
                    failureMode: "degrade",
                    degradationReason: "assistant_message_persistence_failed",
                    logContext: "assistant_message_failure_fallback",
                });
                yield { type: "content", content: fullContent, conversationId: conversation.id };
            }

            if (scopingReportPayload) {
                const topic = scopingReportPayload.topic?.trim();
                const title = topic ? `Scoping: ${topic}`.slice(0, 120) : "Scoping Report";
                const artifact = await createArtifact({
                    runId: activeRun.id,
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
                runFacts.hadSuccessfulToolOrArtifact = true;
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
            await closeTraceOnce({
                stopReason: finalStopReason,
                iterations: loop.iterations,
                toolCalls: loop.totalToolCalls,
                totalTokensIn,
                totalTokensOut,
                scopingSearchCalls: scopingSearchCallsThisRun,
                protocolHandoffExecuted,
            });

            const finalOutcome = deriveRunOutcome({
                facts: runFacts,
                stopReason: finalStopReason,
            });
            finalStopReason = finalOutcome.stopReason;
            const runStatus = finalOutcome.runStatus;

            await finalizeRunOnce(runStatus, totalTokensIn, totalTokensOut);
            const runModelMeta = resolveRunActualModelMeta(baseChatOptions.model, observedRunModel, invokedModel);
            yield {
                type: "run_end",
                runId: activeRun.id,
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
                runFacts.cancelledByUser = true;
                const activeRunId = run?.id;
                if (fullContent) {
                    await addMessageToConversation(conversation.id, {
                        role: "assistant",
                        content: fullContent,
                    });
                    if (activeRunId) {
                        await recordRunEvent({
                            runId: activeRunId,
                            type: "message",
                            payload: { content: fullContent },
                            extras: { messageRole: "assistant" },
                            failureMode: "degrade",
                            degradationReason: "assistant_message_persistence_failed",
                            logContext: "assistant_message_plan_failure",
                        });
                    }
                }

                await closeTraceOnce({ aborted: true });
                if (activeRunId) {
                    await markRunAbnormalEndClassification(activeRunId, "client_abort").catch((markError) => {
                        logServerError("ai-service", "failed to persist client abort classification", {
                            runId: activeRunId,
                            error: markError,
                        });
                    });
                }
                await finalizeRunOnce("cancelled");
                const runModelMeta = resolveRunActualModelMeta(options?.model, null, false);
                if (activeRunId) {
                    yield {
                        type: "run_end",
                        runId: activeRunId,
                        runStatus: "cancelled",
                        conversationId: conversation.id,
                        actualModel: runModelMeta.actualModel ?? undefined,
                        actualModelSource: runModelMeta.actualModelSource,
                    };
                }
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
            await closeTraceOnce({ error: error instanceof Error ? error.message : "Unknown" });
            if (run?.id) {
                const activeRunId = run.id;
                await markRunAbnormalEndClassification(run.id, "unknown").catch((markError) => {
                    logServerError("ai-service", "failed to persist abnormal end classification", {
                        runId: activeRunId,
                        error: markError,
                    });
                });
            }

            const classifiedError = classifyAIError(error);
            if (!classifiedError.retryable) {
                runFacts.hadDeterministicNonRetryableFailure = true;
            }
            if (!classifiedError.retryable && !fullContent.trim() && !runFacts.hadSuccessfulToolOrArtifact) {
                const fallbackContent = buildFailureFallbackMessage(classifiedError.message);
                fullContent = fallbackContent;
                runFacts.hadFinalAssistantAnswer = true;
                await addMessageToConversation(conversation.id, {
                    role: "assistant",
                    content: fallbackContent,
                });
                const activeRunId = run?.id;
                if (activeRunId) {
                    await recordRunEvent({
                        runId: activeRunId,
                        type: "message",
                        payload: { content: fallbackContent },
                        extras: { messageRole: "assistant" },
                        failureMode: "degrade",
                        degradationReason: "assistant_message_persistence_failed",
                        logContext: "assistant_message_catch_fallback",
                    });
                }
                yield { type: "content", content: fallbackContent, conversationId: conversation.id };
            }

            await finalizeRunOnce("failed");
            const terminalErrorChunk = buildStreamErrorChunk(
                toAIErrorEnvelope(error, {
                    kind: "runtime",
                    source: "runtime",
                    message: error instanceof Error ? error.message : "Unexpected error",
                }),
                { conversationId: conversation.id },
            );
            await persistRecoveryErrorChunk(terminalErrorChunk);
            yield terminalErrorChunk;
            const runModelMeta = resolveRunActualModelMeta(options?.model, null, false);
            if (run) {
                yield {
                    type: "run_end",
                    runId: run.id,
                    runStatus: "failed",
                    conversationId: conversation.id,
                    actualModel: runModelMeta.actualModel ?? undefined,
                    actualModelSource: runModelMeta.actualModelSource,
                };
            }
        } finally {
            runHeartbeat?.stop();
            runHeartbeat = null;
            const fallbackStatus = runFacts.cancelledByUser || options?.signal?.aborted
                ? "cancelled"
                : runFacts.pausedForUserInput
                    ? "paused"
                    : "failed";
            const forcedRunFinalization = Boolean(run && !runFinalized);
            if (forcedRunFinalization && run) {
                try {
                    await finalizeRunOnce(fallbackStatus);
                } catch (error) {
                    logServerError("ai-service", "failed to finalize run in finally", {
                        runId: run.id,
                        error,
                    });
                }
            }
            if (trace && !traceEnded) {
                try {
                    await closeTraceOnce({
                        forcedFinalization: forcedRunFinalization,
                        finalRunStatus: finalizedRunStatus ?? fallbackStatus,
                    });
                } catch (error) {
                    logServerError("ai-service", "failed to close trace in finally", {
                        runId: run?.id,
                        error,
                    });
                }
            }
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
    shouldShowScopingSearchPackPreview,
    buildScopingSearchPackPlan,
    finalizeScopingResponse,
} from "./tool-helpers";

function buildSyntheticScopingToolMessage(toolCall: ToolCall, toolResult: ToolResult): AIMessage {
    return {
        id: `tool-result-${toolCall.id}-synthetic`,
        role: "tool",
        content: compactToolResult(
            toolCall.name,
            buildModelVisibleToolResultForTool(toolCall.name, {
                ...toolResult,
                callId: toolCall.id,
            })
        ),
        toolResultId: toolCall.id,
        createdAt: new Date().toISOString(),
    };
}

function buildScopingCorrectionSystemMessage(content: string): AIMessage {
    return {
        id: `scoping-correction-${Date.now()}`,
        role: "system",
        content: `Scoping runtime policy: ${content}`,
        createdAt: new Date().toISOString(),
    };
}

function buildClarificationCorrectionSystemMessage(content: string): AIMessage {
    return {
        id: `clarification-correction-${Date.now()}`,
        role: "system",
        content: `Clarification runtime policy: ${content}`,
        createdAt: new Date().toISOString(),
    };
}

function buildClarificationForcedStopMessage(params: {
    fallbackAction: Exclude<ClarificationFallbackAction, "use_recommended_default">;
    userInputRequest: UserInputRequest;
}): string {
    const question = params.userInputRequest.question.trim();
    const options = Array.isArray(params.userInputRequest.options)
        ? params.userInputRequest.options
            .map((option) => option.label?.trim())
            .filter((label): label is string => Boolean(label))
        : [];

    if (params.fallbackAction === "bounded_terminal_decision") {
        const boundedChoiceList = options.length > 0
            ? `\n\nChoose one of these options and retry:\n${options.map((option) => `- ${option}`).join("\n")}`
            : "";
        return `I can't continue safely without one final decision on: ${question}.${boundedChoiceList}\n\nI'm stopping here instead of asking another blocking clarification in the same run.`;
    }

    return `I can't continue safely because I still need a decision on: ${question}.\n\nI'm stopping here instead of asking another blocking clarification in the same run. Please retry with the missing decision directly.`;
}

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

export function createAIService(config?: { toolMiddlewares?: ToolMiddleware[] }): AIService {
    return new AIService({
        toolMiddlewares: [
            createToolPrerequisiteMiddleware(),
            createIdempotencyMiddleware(),
            ...(config?.toolMiddlewares ?? []),
        ],
    });
}

export function getAIService(): AIService {
    aiServiceInstance ??= createAIService();
    return aiServiceInstance;
}

export { AIService };
