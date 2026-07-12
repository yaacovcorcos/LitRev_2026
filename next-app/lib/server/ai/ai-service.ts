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
import { after } from "next/server";
import {
    AIErrorWithEnvelope,
    buildStreamErrorChunk,
    createPlanExecutionErrorEnvelope,
    envelopeFromStreamChunk,
} from "@/lib/ai/error-envelope";
import { buildFailureFallbackMessage, deriveRunOutcome, type RunFacts } from "@/lib/ai/run-outcome";
import {
    BaseAIProvider,
    getAnthropicProvider,
    getGatewayProvider,
    getGoogleProvider,
    getOpenAIProvider,
    getXAIProvider,
} from "./providers";
import {
    getOrCreateConversation,
    addAssistantMessageToConversationForRun,
    addMessageToConversation,
    getConversationWithSummary,
    getConversationWithSummaryById,
    autoSummarizeIfNeeded,
} from "./memory";
import {
    reserveProviderUsageAttempt,
    tryMarkUsageReservationReconcilable,
    trySettleUsageReservation,
    type SettleUsageReservationInput,
} from "./rate-limiter";
import { retrieveMemories, formatMemoriesForContext, markMemoriesUsedInAnswer, type RetrievedMemory } from "@/lib/server/memory";
import {
    AI_CONFIG,
    getContextBudget,
    getDefaultReasoningEffort,
    getProviderForModel,
    getProviderModelId,
} from "@/lib/ai/config";
import {
    buildModelVisibleToolResultForTool,
    compactToolResult,
    compactLoopMessages,
    buildCompactedHistory,
    estimateMessagesTokensWithSafetyMargin,
    formatSummaryAsMessage,
    repairConversationHistory,
} from "@/lib/agent/compaction";
import { AVAILABLE_TOOLS, executeTool, getTool, validateToolInput } from "./tools";
import {
    isRunOwnershipError,
    startRun,
    endRun,
    getRun,
    startRunHeartbeat,
    markRunAbnormalEndClassification,
    markRunFinalizationFailed,
    markRunFinalizationState,
    recordRunGenerationReceipt,
    type RunHeartbeatController,
} from "@/lib/server/agent/run";
import {
    isTerminalRunStatus,
    type TerminalRunStatus,
} from "@/lib/server/agent/run-state-machine";
import { recordRunEvent } from "@/lib/server/agent/run-event-recorder";
import {
    createArtifact,
    createAutoAppliedArtifact,
} from "@/lib/server/agent/artifacts";
import { getAutonomyConfig } from "@/lib/server/agent/autonomy";
import { buildExecutablePlanPayload } from "@/lib/server/agent/plan-payloads";
import {
    assertNextPlanToolCall,
    failPlanExecution,
    markPlanExecutionRunning,
    preparePlanExecution,
    resolvePlanExecutionToolNames,
    resolvePlanStepResult,
    selectPlanToolCallsForTurn,
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
import { normalizeChatOptionsForModel } from "./request-policy";
import { normalizeUserInputRequestWithDecisionRequest } from "@/lib/ai/decision-requests";
import { createIdempotencyMiddleware, executeWithToolMiddleware, type ToolExecutionRequest, type ToolMiddleware } from "./tool-middleware";
import { createToolPrerequisiteMiddleware, evaluateToolPrerequisites } from "./tool-prerequisites";
import { createToolAvailabilityPolicyMiddleware } from "./tool-availability-policy";
import { resolveAuthenticatedIdentity } from "@/lib/server/auth/identity";
import { computeLedgerCounts, computeStudyLedger } from "@/lib/server/ledger-utils";
import { logServerError, logServerInfo, logServerWarn } from "@/lib/server/logging";
import { ingestChatUnificationMetric } from "@/lib/server/chat-unification-metrics";
import {
    buildRetryModelContinuityPayload,
    deriveChatUnificationSurface,
} from "./chat-unification-runtime-metrics";
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
import { executeToolWithAutonomy, preRecordToolCallBatchForAutonomy } from "./tool-autonomy";
import { isRunLineageToolBudgetExceededError } from "@/lib/server/agent/events";
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
import {
    createDeadlineAbortController,
    createLinkedAbortController,
    isAbortLikeError,
    throwIfAborted,
    type DeadlineAbortController,
    type LinkedAbortController,
} from "@/lib/abort";
import {
    registerActiveRunExecutionCancellation,
    startDurableRunCancellationMonitor,
    type ActiveRunExecutionCancellation,
    type DurableRunCancellationMonitor,
} from "@/lib/server/agent/run-cancellation";
import { deriveSearchSourcePolicy } from "@/lib/agent/search-source-policy";
import {
    withCriticalContextBranchDeadline,
    withOptionalContextBranchDeadline,
} from "./context-branch-runtime";
import { getBackgroundModel } from "./background-model-policy";
import { pinContinuationRoutingOptions } from "./continuation-routing";

const MAX_STREAM_RETRY_ATTEMPTS = 3;
const MAX_OVERFLOW_RECOVERY_ATTEMPTS = 3;
const RETRY_MIN_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 15_000;
const RETRY_JITTER = 0.15;
const CONVERSATION_TITLE_TIMEOUT_MS = 5_000;
const LOCAL_USAGE_POLICY_CODES = new Set([
    "AI_RATE_LIMIT_EXCEEDED",
    "DAILY_TOKEN_LIMIT_EXCEEDED",
    "AI_SOURCE_DAILY_ATTEMPT_LIMIT_EXCEEDED",
]);

function createUsageAttemptKey(): string {
    return crypto.randomUUID();
}

function shouldRetryProviderOperation(error: unknown): boolean {
    const classified = classifyAIError(error);
    if (
        classified.source === "usage_reservation"
        && classified.code
        && LOCAL_USAGE_POLICY_CODES.has(classified.code)
    ) {
        return false;
    }
    return classified.retryable;
}

function estimateProviderAttemptTokens(messages: AIMessage[], options?: ChatOptions): number {
    const messageTokens = estimateMessagesTokensWithSafetyMargin(messages);
    let toolDefinitionTokens = 0;
    if (options?.tools?.length) {
        try {
            toolDefinitionTokens = Math.ceil(JSON.stringify(options.tools).length / 4 * 1.2);
        } catch {
            // A non-serializable tool schema should fail at the provider boundary;
            // reserve a conservative fixed allowance in the meantime.
            toolDefinitionTokens = 1_024;
        }
    }
    const configuredDefaultOutputTokens = Number.isFinite(AI_CONFIG.defaultMaxTokens)
        ? Math.max(0, Math.round(AI_CONFIG.defaultMaxTokens))
        : 2_048;
    const outputTokens = Number.isFinite(options?.maxTokens)
        ? Math.max(0, Math.round(options?.maxTokens ?? 0))
        : configuredDefaultOutputTokens;
    // Provider-side vision tokenization is format- and resolution-dependent.
    // Hold a conservative allowance until actual provider usage settles it.
    const attachmentTokens = (options?.userMessageAttachments?.length ?? 0) * 4_096;
    return Math.max(
        1,
        messageTokens
            + toolDefinitionTokens
            + attachmentTokens
            + outputTokens,
    );
}

function scheduleDeferredUsageSettlement(input: SettleUsageReservationInput): void {
    try {
        after(async () => {
            try {
                const settled = await trySettleUsageReservation(input, { deadlineMs: 2_000 });
                if (!settled) {
                    logServerWarn("ai-service", "usage settlement remains pending after response", {
                        reservationId: input.reservationId,
                    });
                }
            } catch (error) {
                logServerWarn("ai-service", "usage settlement retry rejected after response", {
                    reservationId: input.reservationId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });
    } catch (error) {
        // The durable reservation remains a conservative, reconcilable charge.
        logServerWarn("ai-service", "usage settlement retry was not scheduled", {
            reservationId: input.reservationId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function settleUsageAfterProviderAttempt(input: SettleUsageReservationInput): Promise<void> {
    let settled = false;
    try {
        settled = await trySettleUsageReservation(input);
    } catch (error) {
        logServerWarn("ai-service", "usage settlement attempt rejected", {
            reservationId: input.reservationId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    if (!settled) {
        scheduleDeferredUsageSettlement(input);
    }
}

async function markUsageAttemptReconcilableWithoutBlocking(
    reservationId: string,
    status: "failed" | "unknown",
    failureCode: string,
): Promise<void> {
    try {
        const marked = await tryMarkUsageReservationReconcilable(
            reservationId,
            status,
            failureCode,
        );
        if (marked) return;

        try {
            after(async () => {
                const retried = await tryMarkUsageReservationReconcilable(
                    reservationId,
                    status,
                    failureCode,
                    { deadlineMs: 2_000 },
                );
                if (!retried) {
                    logServerWarn("ai-service", "usage reservation outcome remains pending", {
                        reservationId,
                        status,
                        failureCode,
                    });
                }
            });
        } catch (error) {
            logServerWarn("ai-service", "usage reservation outcome retry was not scheduled", {
                reservationId,
                status,
                failureCode,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    } catch (error) {
        // An active reservation is already durable and counts conservatively.
        logServerWarn("ai-service", "usage reservation outcome update rejected", {
            reservationId,
            status,
            failureCode,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

function schedulePostResponseTask({
    taskName,
    conversationId,
    runId,
    task,
}: {
    taskName: string;
    conversationId: string;
    runId: string;
    task: () => Promise<unknown>;
}): void {
    try {
        after(async () => {
            try {
                await task();
            } catch (error) {
                logServerWarn("ai-service", `${taskName} failed after response`, {
                    conversationId,
                    runId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });
    } catch (error) {
        logServerWarn("ai-service", `${taskName} was not scheduled`, {
            conversationId,
            runId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

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
    | "critical_timeout"
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
    if (errorMeta.code === "CRITICAL_CONTEXT_BRANCH_TIMEOUT") {
        return { failureClass: "critical_timeout", errorMeta };
    }
    if (errorMeta.code === "CONTEXT_BRANCH_TIMEOUT") {
        return { failureClass: "semantic_timeout", errorMeta };
    }
    if (/semantic/i.test(errorMeta.message) && /timed?\s*out/i.test(errorMeta.message)) {
        return { failureClass: "semantic_timeout", errorMeta };
    }
    return { failureClass: "unknown_context_failure", errorMeta };
}

function stopReasonForTerminalStatus(
    status: TerminalRunStatus,
    fallback?: StopReason,
): StopReason | undefined {
    if (status === "cancelled") return "cancelled";
    if (status === "paused") return "paused_for_input";
    if (status === "failed") return "error";
    return fallback;
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
    signal?: AbortSignal;
    meta: {
        runId?: string | null;
        conversationId?: string | null;
        projectId?: string | null;
        agentMode?: AgentMode;
    };
}): Promise<{ value: T; record: ContextBranchRecord }> {
    const startedAt = Date.now();
    try {
        // This path may perform admission or creation writes. Do not race it:
        // Prisma cannot cancel an in-flight write safely from an AbortSignal.
        throwIfAborted(params.signal);
        const value = await params.operation();
        throwIfAborted(params.signal);
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

async function runCriticalReadContextBranch<T>(params: {
    branch: ContextBranchName;
    operation: (signal: AbortSignal) => Promise<T>;
    signal?: AbortSignal;
    meta: {
        runId?: string | null;
        conversationId?: string | null;
        projectId?: string | null;
        agentMode?: AgentMode;
    };
}): Promise<{ value: T; record: ContextBranchRecord }> {
    const startedAt = Date.now();
    try {
        const value = await withCriticalContextBranchDeadline(params.operation, {
            signal: params.signal,
            branch: params.branch,
        });
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
    operation: (signal: AbortSignal) => Promise<T>;
    signal?: AbortSignal;
    meta: {
        runId?: string | null;
        conversationId?: string | null;
        projectId?: string | null;
        agentMode?: AgentMode;
    };
}): Promise<{ value: T; record: ContextBranchRecord } | { value: null; record: ContextBranchRecord }> {
    const startedAt = Date.now();
    try {
        const value = await withOptionalContextBranchDeadline(params.operation, {
            signal: params.signal,
            branch: params.branch,
        });
        const record: ContextBranchRecord = {
            branch: params.branch,
            critical: false,
            durationMs: Date.now() - startedAt,
            success: true,
        };
        logContextBranch(record, params.meta);
        return { value, record };
    } catch (error) {
        if (params.signal?.aborted || isAbortLikeError(error)) {
            throw error;
        }
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
            actualModel: getProviderModelId(requestedModel ?? AI_CONFIG.defaultModel)
                ?? requestedModel
                ?? AI_CONFIG.defaultModel,
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
    rootRunId?: string | null;
    systemContexts?: {
        projectContext?: string;
        protocolContext?: string;
        ledgerContext?: string;
        memoryContext?: string;
        autonomyContext?: string;
        selectedModel?: string;
    };
    protocolData?: ProtocolData | null;
    autonomyConfig?: {
        preset: string;
        toolOverrides: Record<string, unknown>;
    };
    allowedToolNames?: string[];
    preRecordedAutonomyLevels?: ReadonlyMap<string, number>;
    model?: string;
    reasoningEffort?: ChatOptions["reasoningEffort"];
    deliveryMode?: ChatOptions["deliveryMode"];
};

function latestUserMessageContent(messages: AIMessage[]): string {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message?.role === "user") return message.content;
    }
    return "";
}

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

        const gateway = getGatewayProvider();
        if (gateway.isConfigured()) this.registerProvider(gateway);
    }

    registerToolMiddleware(middleware: ToolMiddleware): void {
        this.toolMiddlewares.push(middleware);
    }

    clearToolMiddlewares(): void {
        this.toolMiddlewares.length = 0;
    }

    async executeToolWithMiddleware(
        request: ToolExecutionRequest,
        finalizeResult?: (
            result: ToolResult,
            request: ToolExecutionRequest,
        ) => Promise<ToolResult>,
    ): Promise<ToolResult> {
        // Validate and normalize before persistence/idempotency middleware.
        // This keeps malformed or adversarially deep provider arguments away
        // from fingerprinting and guarantees middleware keys use Zod-normalized
        // values rather than an untrusted transport object.
        const tool = getTool(request.name);
        if (tool) {
            const inputValidation = validateToolInput(tool, request.args);
            if (!inputValidation.success) {
                return {
                    callId: request.callId,
                    result: null,
                    error: inputValidation.error,
                    errorMeta: inputValidation.errorMeta,
                };
            }
            request = {
                ...request,
                args: inputValidation.data as Record<string, unknown>,
            };
        }
        return executeWithToolMiddleware(
            request,
            this.toolMiddlewares,
            async (resolvedRequest) => {
                const result = await executeTool(
                    resolvedRequest.name,
                    resolvedRequest.args,
                    resolvedRequest.callId,
                    resolvedRequest.context,
                );
                return finalizeResult
                    ? finalizeResult(result, resolvedRequest)
                    : result;
            },
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
     * Resolve the correct provider for a model ID. Unknown model IDs fail
     * closed so request metadata can never silently diverge from execution.
     */
    resolveProvider(modelId?: string): BaseAIProvider {
        const resolvedModel = modelId ?? AI_CONFIG.defaultModel;
        const providerId = getProviderForModel(resolvedModel);
        if (!providerId) {
            throw new AIErrorWithEnvelope({
                kind: "model_capability",
                code: "UNKNOWN_MODEL",
                retryable: false,
                source: "request_policy",
                message: `Unknown model: ${resolvedModel}`,
            });
        }
        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new AIErrorWithEnvelope({
                kind: "provider_request",
                code: "PROVIDER_NOT_CONFIGURED",
                retryable: false,
                source: "provider_request",
                message: `The provider for ${resolvedModel} is not configured yet. Add its server API key and try again.`,
            });
        }
        return provider;
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
        return normalizeChatOptionsForModel({
            ...(options ?? {}),
            reasoningMode: mode,
            includeReasoning,
            // Reasoning visibility and provider compute budget are independent.
            reasoningBudgetTokens: options?.reasoningBudgetTokens,
        });
    }

    private async maybeGenerateConversationTitle(params: {
        conversationId: string;
        projectId?: string;
        historicalAssistantCount: number;
        firstUserMessage: string;
        assistantMessage: string;
        fallbackTitle: string;
        signal?: AbortSignal;
    }): Promise<string | null> {
        const {
            conversationId,
            projectId,
            historicalAssistantCount,
            firstUserMessage,
            assistantMessage,
            fallbackTitle,
            signal,
        } = params;

        // Only name a conversation on its first assistant reply.
        if (historicalAssistantCount > 0) return null;
        if (!assistantMessage.trim()) return null;
        if (!firstUserMessage.trim()) return null;

        const fallbackSeed = firstUserMessage || assistantMessage;
        let candidate: string;

        try {
            const response = await withOptionalContextBranchDeadline(
                (branchSignal) => this.chat(
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
                        model: getBackgroundModel("fast"),
                        reasoningEffort: "fast",
                        temperature: 0.2,
                        maxTokens: 24,
                        signal: branchSignal,
                    },
                ),
                {
                    branch: "conversation_title",
                    signal,
                    timeoutMs: CONVERSATION_TITLE_TIMEOUT_MS,
                }
            );
            candidate = sanitizeGeneratedConversationTitle(response.content, fallbackSeed);
        } catch {
            throwIfAborted(signal);
            // The deterministic title is already durable and visible.
            return null;
        }

        if (candidate === fallbackTitle) return null;
        throwIfAborted(signal);
        const updated = await prisma.aIConversation.updateMany({
            // Never overwrite a user edit or another writer's refinement.
            where: { id: conversationId, title: fallbackTitle },
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
        const provider = this.resolveProvider(options?.model);
        const effectiveOptions = this.withProviderReasoningPolicy(options);
        let attemptKey = createUsageAttemptKey();
        const response = await retryAsync(
            async () => {
                const reservation = await reserveProviderUsageAttempt({
                    attemptKey,
                    scope: {
                        projectId,
                        userId: identity.userId,
                        workspaceId: identity.workspaceId ?? null,
                    },
                    provider: provider.id,
                    model: effectiveOptions.model ?? AI_CONFIG.defaultModel,
                    estimatedTokens: estimateProviderAttemptTokens(messages, effectiveOptions),
                    source: projectId ? "project_copilot" : "ai_page",
                    contextPage: optionsWithAttribution?.page ?? (projectId ? "legacy_unknown" : "ai"),
                    conversationId: options?.conversationId ?? null,
                });
                let response: AIResponse;
                try {
                    // Admission retries reuse the same key. Once provider invocation
                    // starts, a later provider retry is a distinct billable attempt.
                    attemptKey = createUsageAttemptKey();
                    response = await provider.chat(messages, effectiveOptions);
                } catch (error) {
                    const classified = classifyAIError(error);
                    await markUsageAttemptReconcilableWithoutBlocking(
                        reservation.id,
                        "failed",
                        classified.code ?? "PROVIDER_ATTEMPT_FAILED",
                    );
                    throw error;
                }

                await settleUsageAfterProviderAttempt({
                    reservationId: reservation.id,
                    model: response.model,
                    provider: response.actualProvider ?? (provider.id === "gateway" ? null : provider.id),
                    requestedModel: effectiveOptions.model ?? AI_CONFIG.defaultModel,
                    requestedProvider: provider.id,
                    requestedReasoningEffort: effectiveOptions.reasoningEffort,
                    requestedDeliveryMode: effectiveOptions.deliveryMode,
                    actualReasoningEffort: response.actualReasoningEffort,
                    actualDeliveryMode: response.actualDeliveryMode,
                    inputTokens: response.usage.inputTokens,
                    outputTokens: response.usage.outputTokens,
                    cachedInputTokens: response.usage.cachedInputTokens,
                    cacheWriteInputTokens: response.usage.cacheWriteInputTokens,
                    reasoningTokens: response.usage.reasoningTokens,
                });
                return response;
            },
            {
                attempts: MAX_STREAM_RETRY_ATTEMPTS,
                minDelayMs: RETRY_MIN_DELAY_MS,
                maxDelayMs: RETRY_MAX_DELAY_MS,
                jitter: RETRY_JITTER,
                signal: effectiveOptions?.signal,
                shouldRetry: shouldRetryProviderOperation,
                retryAfterMs: (error) => classifyAIError(error).retryAfterMs,
            }
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
        const provider = this.resolveProvider(options?.model);
        const effectiveOptions = this.withProviderReasoningPolicy(options);
        // A generator invocation is one provider attempt. Never share this key
        // through caller-owned options: the same options object may drive
        // concurrent streams, and every provider call needs its own reservation.
        const attemptKey = createUsageAttemptKey();
        const reservation = await reserveProviderUsageAttempt({
            attemptKey,
            scope: {
                projectId,
                userId: identity.userId,
                workspaceId: identity.workspaceId ?? null,
            },
            provider: provider.id,
            model: effectiveOptions.model ?? AI_CONFIG.defaultModel,
            estimatedTokens: estimateProviderAttemptTokens(messages, effectiveOptions),
            source: projectId ? "project_copilot" : "ai_page",
            contextPage: optionsWithAttribution?.page ?? (projectId ? "legacy_unknown" : "ai"),
            conversationId: options?.conversationId ?? null,
        });

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCachedInputTokens = 0;
        let totalCacheWriteInputTokens = 0;
        let totalReasoningTokens = 0;
        let observedModel: string | null = null;
        let observedProvider: string | null = null;
        let observedReasoningEffort: ChatOptions["reasoningEffort"];
        let observedDeliveryMode: ChatOptions["deliveryMode"];
        let observedUsage = false;
        let observedProviderChunk = false;
        let observedProviderError = false;
        let failureCode = "PROVIDER_STREAM_INCOMPLETE";

        try {
            for await (const chunk of provider.streamChat(messages, effectiveOptions)) {
                observedProviderChunk = true;
                if (chunk.type === "done") {
                    if (chunk.usage) {
                        observedUsage = true;
                        totalInputTokens = chunk.usage.inputTokens;
                        totalOutputTokens = chunk.usage.outputTokens;
                        totalCachedInputTokens = chunk.usage.cachedInputTokens ?? 0;
                        totalCacheWriteInputTokens = chunk.usage.cacheWriteInputTokens ?? 0;
                        totalReasoningTokens = chunk.usage.reasoningTokens ?? 0;
                    }
                    if (typeof chunk.actualModel === "string" && chunk.actualModel.trim().length > 0) {
                        observedModel = chunk.actualModel;
                    }
                    observedProvider = chunk.actualProvider ?? observedProvider;
                    observedReasoningEffort = chunk.actualReasoningEffort ?? observedReasoningEffort;
                    observedDeliveryMode = chunk.actualDeliveryMode ?? observedDeliveryMode;
                } else if (chunk.type === "error") {
                    observedProviderError = true;
                    failureCode = chunk.errorCode ?? chunk.errorMeta?.code ?? "PROVIDER_STREAM_ERROR";
                }
                yield chunk;
            }
        } catch (error) {
            const classified = classifyAIError(error);
            failureCode = classified.code ?? "PROVIDER_STREAM_FAILED";
            observedProviderError = true;
            throw error;
        } finally {
            if (observedUsage && !observedProviderError) {
                await settleUsageAfterProviderAttempt({
                    reservationId: reservation.id,
                    model: observedModel ?? effectiveOptions?.model ?? AI_CONFIG.defaultModel,
                    provider: observedProvider ?? (provider.id === "gateway" ? null : provider.id),
                    requestedModel: effectiveOptions.model ?? AI_CONFIG.defaultModel,
                    requestedProvider: provider.id,
                    requestedReasoningEffort: effectiveOptions.reasoningEffort,
                    requestedDeliveryMode: effectiveOptions.deliveryMode,
                    actualReasoningEffort: observedReasoningEffort,
                    actualDeliveryMode: observedDeliveryMode,
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens,
                    cachedInputTokens: totalCachedInputTokens,
                    cacheWriteInputTokens: totalCacheWriteInputTokens,
                    reasoningTokens: totalReasoningTokens,
                });
            } else {
                await markUsageAttemptReconcilableWithoutBlocking(
                    reservation.id,
                    observedProviderChunk ? "unknown" : "failed",
                    failureCode,
                );
            }
        }
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
        const latestUserMessage = latestUserMessageContent(messages);
        const toolDefs = options?.tools ?? getContextualToolDefinitions({
            agentMode,
            scope,
            studyLedger: null,
            studyId: options?.studyId ?? null,
            userMessage: latestUserMessage,
        });
        const allowedToolNames = toolDefs.map((tool) => tool.name);
        if (toolDefs.length === 0) {
            yield* this.streamChat(messages, options);
            return;
        }

        const currentMessages = [...messages];
        const loop = new LoopState();
        const loopDeadline = createDeadlineAbortController(
            loop.budget?.maxWallTimeMs ?? 120_000,
            [options?.signal],
        );
        const loopSignal = loopDeadline.signal;
        const optionsWithTools: ChatOptions = { ...options, tools: toolDefs, signal: loopSignal };
        const budget = getContextBudget(options?.model);

        try {
            while (true) {
            if (loopDeadline.timedOut()) loop.markStopped("wall_time");
            const check = loop.shouldContinue(loopSignal);
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
            let providerReasoningContent: string | undefined;
            let retryCount = 0;
            let overflowRecoveryCount = 0;

            while (true) {
                collectedToolCalls = [];
                contentSoFar = "";
                providerReasoningContent = undefined;
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
                            providerReasoningContent = chunk.providerReasoningContent;
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
                            if (!hadVisibleOutput && shouldRetryProviderOperation(errorMeta) && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
                                shouldRetry = true;
                                retryAfterMs = classified.retryAfterMs;
                                break;
                            }
                            terminalErrorChunk = buildStreamErrorChunk({ ...errorMeta, message });
                            break;
                        }
                    }
                } catch (error) {
                    if (loopDeadline.timedOut() && isAbortLikeError(error)) {
                        throw error;
                    }
                    const classified = classifyAIError(error);
                    if (!hadVisibleOutput && classified.reason === "context_overflow" && overflowRecoveryCount < MAX_OVERFLOW_RECOVERY_ATTEMPTS) {
                        shouldRecoverOverflow = true;
                    } else if (!hadVisibleOutput && shouldRetryProviderOperation(error) && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
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
                    await sleep(delayMs, loopSignal).catch(() => {});
                    if (loopSignal.aborted) {
                        const stopReason = loopDeadline.timedOut() ? "wall_time" : "cancelled";
                        loop.markStopped(stopReason);
                        yield {
                            type: "done",
                            content: stopReasonMessage(stopReason),
                            stopReason,
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

            // Reserve capacity before any executor can observe this batch.
            const repeatDetected = loop.recordToolCalls(repeatKeyedToolCalls);
            if (loop.stopReason === "max_tool_calls") {
                yield {
                    type: "done",
                    content: stopReasonMessage("max_tool_calls"),
                    stopReason: "max_tool_calls",
                };
                return;
            }
            if (repeatDetected) {
                yield {
                    type: "done",
                    content: stopReasonMessage("repeat_detected"),
                    stopReason: "repeat_detected",
                };
                return;
            }

            for (const toolCall of collectedToolCalls) {
                yield { type: "tool_call", toolCall };
            }

            const assistantMsg: AIMessage = {
                id: `tool-loop-assistant-${loop.iterations}`,
                role: "assistant",
                content: contentSoFar,
                toolCalls: collectedToolCalls,
                providerReasoningContent,
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
                        allowedToolNames,
                        systemContexts: { selectedModel: options?.model },
                        signal: loopSignal,
                        model: optionsWithTools.model,
                        reasoningEffort: optionsWithTools.reasoningEffort,
                        deliveryMode: optionsWithTools.deliveryMode,
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
        } catch (error) {
            if (loopDeadline.timedOut() && isAbortLikeError(error)) {
                loop.markStopped("wall_time");
                yield {
                    type: "done",
                    content: stopReasonMessage("wall_time"),
                    stopReason: "wall_time",
                };
                return;
            }
            throw error;
        } finally {
            loopDeadline.dispose();
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
        let runExecutionCancellation: ActiveRunExecutionCancellation | null = null;
        let durableRunCancellationMonitor: DurableRunCancellationMonitor | null = null;
        let linkedExecutionCancellation: LinkedAbortController | null = null;
        let runLoopDeadline: DeadlineAbortController | null = null;
        let executionSignal: AbortSignal | undefined = options?.signal;
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
            const planId = options.planId;
            const selectedSteps = options.selectedSteps;
            const planExecutionResult = await runCriticalReadContextBranch({
                branch: "plan_execution",
                operation: () => preparePlanExecution(
                    planId,
                    selectedSteps,
                    projectId,
                ),
                signal: options?.signal,
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
        const conversationResult = authoritativeConversationId
            ? await runCriticalReadContextBranch({
                branch: "conversation",
                operation: async () => {
                    const byId = await getConversationWithSummaryById(
                        authoritativeConversationId,
                        userId,
                        workspaceId,
                    );
                    if (!byId) {
                        throw new Error(`Invalid, archived, or inaccessible conversationId: ${authoritativeConversationId}`);
                    }
                    return byId;
                },
                signal: options?.signal,
                meta: {
                    projectId: projectId ?? null,
                    agentMode,
                },
            })
            : await runCriticalContextBranch({
                branch: "conversation",
                operation: () => getConversationWithSummary(
                    context,
                    projectId,
                    studyId,
                    workspaceId ? { userId, workspaceId } : undefined,
                ),
                signal: options?.signal,
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
        options = await pinContinuationRoutingOptions(options, conversation.id);
        const budget = getContextBudget(options?.model);

        // Coarse conversation-level lock: block overlapping fresh runs and
        // auto-cancel stale "running" rows left behind by interrupted sessions.
        const runAvailabilityResult = await runCriticalContextBranch({
            branch: "run_availability",
            operation: () => ensureConversationRunAvailability(conversation.id, {
                replaceRunId: options?.replaceRunId,
            }),
            signal: options?.signal,
            meta: {
                conversationId: conversation.id,
                projectId: projectId ?? null,
                agentMode,
            },
        });
        contextBranchRecords.push(runAvailabilityResult.record);

        // Declared outside try so catch block can access them for plan finalization
        const planData: PreparedPlanExecution | null = preparedPlanExecution;
        let planExecutionAttemptId: string | null = null;
        let planExecutionSettled = false;
        let stepQueue: PlanExecutionStepState[] = [];
        let fullContent = "";
        // Provider-observed routing must outlive the inner loop so every
        // terminal path can return the same truthful generation receipt.
        let observedRunModel: string | null = null;
        let observedRunProvider: string | null = null;
        let observedRunReasoningEffort: ChatOptions["reasoningEffort"];
        let observedRunDeliveryMode: ChatOptions["deliveryMode"];
        let invokedModel = false;
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
        if (workspaceId && options?.telemetryRequestKey) {
            try {
                await ingestChatUnificationMetric(
                    { userId, workspaceId, role: "member" },
                    {
                        eventId: crypto.randomUUID(),
                        type: "retry_model_continuity",
                        surface,
                        conversationId: conversation.id,
                        projectId: projectId ?? null,
                        payload: buildRetryModelContinuityPayload({
                            requestKey: options.telemetryRequestKey,
                            model: options.model ?? AI_CONFIG.defaultModel,
                        }),
                    },
                );
            } catch (error) {
                logServerWarn("ai-service", "failed to ingest retry model continuity metric", {
                    conversationId: conversation.id,
                    projectId: projectId ?? null,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
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
        const stopRunLivenessControllers = () => {
            durableRunCancellationMonitor?.stop();
            durableRunCancellationMonitor = null;
            runHeartbeat?.stop();
            runHeartbeat = null;
        };
        const adoptExternalTerminalStatus = (status: TerminalRunStatus) => {
            runFinalized = true;
            finalizedRunStatus = status;
            return true;
        };
        const inspectPersistedTerminalRunStatus = async (
            runId: string,
        ): Promise<TerminalRunStatus | null> => {
            try {
                const persistedRun = await getRun(runId);
                return isTerminalRunStatus(persistedRun?.status) ? persistedRun.status : null;
            } catch (error) {
                logServerWarn("ai-service", "failed to inspect run after finalization race", {
                    runId,
                    error: error instanceof Error ? error.message : String(error),
                });
                return null;
            }
        };
        const finalizeRunOnce = async (
            status: "completed" | "failed" | "cancelled" | "paused",
            costTokensIn?: number,
            costTokensOut?: number,
        ): Promise<boolean> => {
            if (!run || runFinalized) return true;
            stopRunLivenessControllers();
            const activeRunId = run.id;
            let startedFinalization: number;
            try {
                startedFinalization = await markRunFinalizationState(activeRunId, "in_progress");
            } catch (error) {
                if (isRunOwnershipError(error)) {
                    if (isTerminalRunStatus(error.status)) {
                        return adoptExternalTerminalStatus(error.status);
                    }
                    const terminalStatus = await inspectPersistedTerminalRunStatus(error.runId);
                    if (terminalStatus) {
                        return adoptExternalTerminalStatus(terminalStatus);
                    }
                    runFinalized = true;
                    return false;
                }
                throw error;
            }
            if (startedFinalization === 0) {
                const terminalStatus = await inspectPersistedTerminalRunStatus(activeRunId);
                if (terminalStatus) {
                    return adoptExternalTerminalStatus(terminalStatus);
                }
                runFinalized = true;
                return false;
            }
            try {
                await endRun(activeRunId, status, costTokensIn, costTokensOut);
            } catch (error) {
                if (isRunOwnershipError(error)) {
                    if (isTerminalRunStatus(error.status)) {
                        return adoptExternalTerminalStatus(error.status);
                    }
                    const terminalStatus = await inspectPersistedTerminalRunStatus(error.runId);
                    if (terminalStatus) {
                        return adoptExternalTerminalStatus(terminalStatus);
                    }
                    runFinalized = true;
                    return false;
                }
                await markRunFinalizationFailed(activeRunId).catch((markError) => {
                    logServerError("ai-service", "failed to persist finalization failure", {
                        runId: activeRunId,
                        error: markError,
                    });
                });
                throw error;
            }
            runFinalized = true;
            finalizedRunStatus = status;
            return true;
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
                model: options?.model ?? AI_CONFIG.defaultModel,
                provider: getProviderForModel(options?.model ?? AI_CONFIG.defaultModel),
                reasoningEffort: options?.reasoningEffort
                    ?? getDefaultReasoningEffort(options?.model ?? AI_CONFIG.defaultModel),
                deliveryMode: options?.deliveryMode ?? "standard",
                initialPhase: options?.continuationContext ? "verify" : "plan",
            });
            const activeRun = run;
            runExecutionCancellation = registerActiveRunExecutionCancellation(activeRun.id);
            durableRunCancellationMonitor = startDurableRunCancellationMonitor(activeRun.id, {
                abort: runExecutionCancellation.abort,
                onError: (error) => {
                    logServerWarn("ai/run-cancellation-monitor", "failed", {
                        runId: activeRun.id,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });
            linkedExecutionCancellation = createLinkedAbortController([
                options?.signal,
                runExecutionCancellation.signal,
            ]);
            executionSignal = linkedExecutionCancellation.signal;
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

            const autonomyConfigResult = await runCriticalReadContextBranch({
                branch: "autonomy_config",
                operation: () => getAutonomyConfig(userId, projectId),
                signal: executionSignal,
                meta: contextMeta,
            });
            contextBranchRecords.push(autonomyConfigResult.record);
            const autonomyConfig = autonomyConfigResult.value;

            const optionalBranchResults = await Promise.all([
                runOptionalContextBranch({
                    branch: "memories",
                    signal: executionSignal,
                    operation: (branchSignal) => retrieveMemories(
                        {
                            userId,
                            projectId,
                            studyId,
                            conversationId: conversation.id,
                            query: runtimeQueryText,
                            agentMode,
                            runId: activeRun.id,
                        },
                        { signal: branchSignal },
                    ),
                    meta: contextMeta,
                }),
                runOptionalContextBranch({
                    branch: "protocol",
                    signal: executionSignal,
                    operation: () => projectId
                        ? prisma.protocol.findFirst({ where: { projectId }, select: { data: true } })
                        : Promise.resolve(null),
                    meta: contextMeta,
                }),
                runOptionalContextBranch({
                    branch: "ledger",
                    signal: executionSignal,
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
                    signal: executionSignal,
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
                    signal: executionSignal,
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
            + `\n- ask_user runtime contract: use it only for a real blocking decision boundary, not routine narrowing. Ask one compact decision before durable progress, include a safe recommended default whenever one exists, and explain why the decision changes the next step. Once resolved, treat the decision as authoritative and continue; do not re-ask the same boundary. If runtime policy prevents another blocking decision, either use the safe recommended default, present one bounded terminal decision point, or stop truthfully.`;

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
            const explicitSearchSourceToolNames = executionMode && planData
                ? planData.selectedSteps
                    .map((step) => step.toolName)
                    .filter((toolName): toolName is string => typeof toolName === "string")
                : undefined;
            const searchSourcePolicy = deriveSearchSourcePolicy({
                text: runtimeQueryText,
                explicitToolNames: explicitSearchSourceToolNames,
            });
            const modeToolDefs = getContextualToolDefinitions({
                agentMode,
                scope: toolScope,
                studyLedger,
                studyId: studyId ?? null,
                userMessage: runtimeQueryText,
                explicitSearchSourceToolNames,
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
                    sourcePolicy: searchSourcePolicy,
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

                        const finalized = await finalizeRunOnce("completed");
                        if (!finalized) {
                            return;
                        }
                        const runModelMeta = resolveRunActualModelMeta(options?.model, null, false);
                        const terminalStatus = finalizedRunStatus ?? "completed";
                        yield {
                            type: "run_end",
                            runId: activeRun.id,
                            runStatus: terminalStatus,
                            stopReason: stopReasonForTerminalStatus(terminalStatus),
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
                planExecutionAttemptId = activeRun.id;
                await markPlanExecutionRunning(options.planId, planExecutionAttemptId);

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
                conversationId: conversation.id,
            };

            const currentMessages = [...historyMessages];
            let totalTokensIn = 0;
            let totalTokensOut = 0;
            const loop = new LoopState();
            runLoopDeadline = createDeadlineAbortController(
                loop.budget?.maxWallTimeMs ?? 120_000,
                [executionSignal],
            );
            const loopSignal = runLoopDeadline.signal;
            let forcedClarificationStop: {
                content: string;
                fallbackAction: ClarificationFallbackAction;
                reason: string;
            } | null = null;
            const scopingWorkflowMessageId = "scoping-workflow";

            while (true) {
                if (runLoopDeadline.timedOut()) loop.markStopped("wall_time");
                const check = loop.shouldContinue(loopSignal);
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
                const iterationToolNames = iterationToolDefs.map((tool) => tool.name);
                const iterationChatOptions: ChatOptions = {
                    ...baseChatOptions,
                    signal: loopSignal,
                    ...(iterationToolDefs.length > 0 ? { tools: iterationToolDefs } : {}),
                };

                let collectedToolCalls: ToolCall[] = [];
                let contentSoFar = "";
                let providerReasoningContent: string | undefined;
                let retryCount = 0;
                let overflowRecoveryCount = 0;

                while (true) {
                    collectedToolCalls = [];
                    contentSoFar = "";
                    providerReasoningContent = undefined;
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
                                providerReasoningContent = chunk.providerReasoningContent;
                                if (chunk.usage) {
                                    totalTokensIn += chunk.usage.inputTokens;
                                    totalTokensOut += chunk.usage.outputTokens;
                                    genSpan.update({ usageDetails: { input: chunk.usage.inputTokens, output: chunk.usage.outputTokens } });
                                }
                                if (typeof chunk.actualModel === "string" && chunk.actualModel.trim().length > 0) {
                                    observedRunModel = chunk.actualModel;
                                }
                                observedRunProvider = chunk.actualProvider ?? observedRunProvider;
                                observedRunReasoningEffort = chunk.actualReasoningEffort ?? observedRunReasoningEffort;
                                observedRunDeliveryMode = chunk.actualDeliveryMode ?? observedRunDeliveryMode;
                                await recordRunGenerationReceipt(activeRun.id, {
                                    // Requested routing already lives on AgentRun. Only
                                    // persist fields the provider actually reported so
                                    // recovery never upgrades a fallback into observed truth.
                                    actualModel: observedRunModel,
                                    actualProvider: observedRunProvider,
                                    actualReasoningEffort: observedRunReasoningEffort,
                                    actualDeliveryMode: observedRunDeliveryMode,
                                });
                            } else if (chunk.type === "error") {
                                const errorMeta = envelopeFromStreamChunk(chunk);
                                const classified = classifyAIError(errorMeta);
                                if (!hadVisibleOutput && classified.reason === "context_overflow" && overflowRecoveryCount < MAX_OVERFLOW_RECOVERY_ATTEMPTS) {
                                    shouldRecoverOverflow = true;
                                    break;
                                }
                                if (!hadVisibleOutput && shouldRetryProviderOperation(errorMeta) && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
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
                        if (loopSignal.aborted || isAbortLikeError(error)) {
                            genSpan.end();
                            throw error;
                        }
                        const classified = classifyAIError(error);
                        if (!hadVisibleOutput && classified.reason === "context_overflow" && overflowRecoveryCount < MAX_OVERFLOW_RECOVERY_ATTEMPTS) {
                            shouldRecoverOverflow = true;
                        } else if (!hadVisibleOutput && shouldRetryProviderOperation(error) && retryCount < MAX_STREAM_RETRY_ATTEMPTS) {
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
                        await sleep(delayMs, loopSignal).catch(() => {});
                        if (loopSignal.aborted) {
                            loop.markStopped(runLoopDeadline.timedOut() ? "wall_time" : "cancelled");
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
                            await addAssistantMessageToConversationForRun({
                                runId: activeRun.id,
                                conversationId: conversation.id,
                                content: fallbackContent,
                            });
                            // Persist one calm fallback for conversation reload, but do not
                            // stream it beside the structured error below. The live surface
                            // renders the typed error once and still consumes the authoritative
                            // run_end; replay later has one fallback assistant message.
                        }
                        loop.markStopped("error");
                        await persistRecoveryErrorChunk(terminalErrorChunk);
                        const finalized = await finalizeRunOnce("failed");
                        if (!finalized) {
                            return;
                        }
                        // Durable terminal truth must exist before the client can
                        // observe the error and disconnect the stream.
                        yield terminalErrorChunk;
                        const runModelMeta = resolveRunActualModelMeta(iterationChatOptions.model, observedRunModel, invokedModel);
                        const terminalStatus: TerminalRunStatus = finalizedRunStatus ?? "failed";
                        yield {
                            type: "run_end",
                            runId: activeRun.id,
                            runStatus: terminalStatus,
                            stopReason: stopReasonForTerminalStatus(terminalStatus, "error"),
                            conversationId: conversation.id,
                            actualModel: runModelMeta.actualModel ?? undefined,
                            actualModelSource: runModelMeta.actualModelSource,
                            actualProvider: observedRunProvider ?? undefined,
                            actualReasoningEffort: observedRunReasoningEffort,
                            actualDeliveryMode: observedRunDeliveryMode,
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

                if (executionMode) {
                    const planToolCallSelection = selectPlanToolCallsForTurn(collectedToolCalls);
                    if (planToolCallSelection.deferredToolCalls.length > 0) {
                        logServerWarn("ai-service", "deferred speculative plan tool calls until a result-dependent turn", {
                            planId: options?.planId,
                            admittedToolCallId: planToolCallSelection.admittedToolCalls[0]?.id,
                            deferredToolCallIds: planToolCallSelection.deferredToolCalls.map((toolCall) => toolCall.id),
                        });
                    }
                    collectedToolCalls = planToolCallSelection.admittedToolCalls;
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
                        allowedToolNames: iterationToolNames,
                    }),
                })));

                // Reserve capacity before any executor can observe this batch.
                const repeatDetected = loop.recordToolCalls(repeatKeyedToolCalls);
                if (loop.stopReason === "max_tool_calls") {
                    break;
                }
                if (repeatDetected) {
                    break; // repeat_detected — shouldContinue will catch it next iteration
                }

                let preRecordedAutonomyLevels: ReadonlyMap<string, number>;
                try {
                    preRecordedAutonomyLevels = await preRecordToolCallBatchForAutonomy({
                        runId: activeRun.id,
                        toolCalls: collectedToolCalls,
                        projectId,
                        userId,
                        agentMode,
                        allowedToolNames: iterationToolNames,
                        cachedAutonomyConfig: autonomyConfig,
                    });
                } catch (error) {
                    if (isRunLineageToolBudgetExceededError(error)) {
                        loop.markStopped("max_tool_calls");
                        break;
                    }
                    throw error;
                }

                for (const toolCall of collectedToolCalls) {
                    yield {
                        type: "tool_call",
                        toolCall,
                        conversationId: conversation.id,
                    };
                }

                const assistantMsg: AIMessage = {
                    id: `tool-loop-assistant-${loop.iterations}`,
                    role: "assistant",
                    content: contentSoFar,
                    toolCalls: collectedToolCalls,
                    providerReasoningContent,
                    createdAt: new Date().toISOString(),
                };
                currentMessages.push(assistantMsg);

                // Execute all tool calls with autonomy
                for (const tc of collectedToolCalls) {
                    const allowedInThisIteration = iterationToolNames.includes(tc.name);
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

                    if (allowedInThisIteration && (
                        tc.name === "search_pubmed" ||
                        tc.name === "search_semantic_scholar" ||
                        tc.name === "search_openalex" ||
                        tc.name === "recommend_studies"
                    )) {
                        scopingSearchCallsThisRun += 1;
                    }

                    // Plan step tracking: match tool call to next unconsumed step
                    let matchedStep: PlanExecutionStepState | undefined;
                    if (executionMode && allowedInThisIteration) {
                        matchedStep = assertNextPlanToolCall(stepQueue, tc.name);
                        matchedStep.consumed = true;
                        matchedStep.finalStatus = "running";
                        yield { type: "plan_step_update", planId: options!.planId!, stepIndex: matchedStep.originalIndex, stepStatus: "running", conversationId: conversation.id };
                    }

                    if (allowedInThisIteration) {
                        yield {
                            type: "progress",
                            progressMessage: mapToolToProgressMessage(tc.name),
                            conversationId: conversation.id,
                        };
                    }

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
                            signal: loopSignal,
                            rootRunId: activeRun.rootRunId ?? activeRun.id,
                            protocolData: (protocolRow?.data as ProtocolData | null) ?? null,
                            allowedToolNames: iterationToolNames,
                            preRecordedAutonomyLevels,
                            model: iterationChatOptions.model,
                            reasoningEffort: iterationChatOptions.reasoningEffort,
                            deliveryMode: iterationChatOptions.deliveryMode,
                            systemContexts: {
                                projectContext,
                                protocolContext,
                                ledgerContext,
                                memoryContext: memoriesContext || undefined,
                                autonomyContext,
                                selectedModel: iterationChatOptions.model,
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
                        const { stepStatus } = resolvePlanStepResult(toolResult);
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
                        const resolvedUserInputRequest = normalizeUserInputRequestWithDecisionRequest({
                            request: {
                                ...toolResult.userInputRequest,
                                sourceRunId: activeRun.id,
                                decisionBoundaryKey: toolResult.userInputRequest.decisionBoundaryKey
                                    ?? resolveDecisionBoundaryKey({
                                        decisionBoundaryKey: toolResult.userInputRequest.decisionBoundaryKey ?? null,
                                        question: toolResult.userInputRequest.question,
                                    }),
                            },
                            sourceRunId: activeRun.id,
                            rootRunId: activeRun.rootRunId ?? activeRun.id,
                            conversationId: conversation.id,
                            projectId,
                            userId,
                            studyId,
                        });
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

                    if (executionMode && resolvePlanStepResult(toolResult).shouldStop) {
                        loop.markStopped("error");
                        break;
                    }
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
                if (
                    !allCompleted
                    || finalStopReason === "cancelled"
                    || finalStopReason === "error"
                    || finalStopReason === "paused_for_input"
                ) {
                    const reason = finalStopReason === "cancelled"
                        ? "Cancelled by user"
                        : finalStopReason === "error"
                            ? "Execution error"
                            : "Plan did not complete all selected steps";
                    if (!planExecutionAttemptId) {
                        throw new AIErrorWithEnvelope(createPlanExecutionErrorEnvelope({
                            code: "PLAN_EXECUTION_ATTEMPT_MISSING",
                            message: "Plan execution lost its runtime ownership token.",
                        }));
                    }
                    await failPlanExecution(options.planId, finalSteps, reason, planExecutionAttemptId);
                    planExecutionSettled = true;
                    if (finalStopReason !== "cancelled" && finalStopReason !== "paused_for_input") {
                        runFacts.hadDeterministicNonRetryableFailure = true;
                    }
                } else {
                    if (!planExecutionAttemptId) {
                        throw new AIErrorWithEnvelope(createPlanExecutionErrorEnvelope({
                            code: "PLAN_EXECUTION_ATTEMPT_MISSING",
                            message: "Plan execution lost its runtime ownership token.",
                        }));
                    }
                    await completePlanExecution(options.planId, finalSteps, planExecutionAttemptId);
                    planExecutionSettled = true;
                    runFacts.hadSuccessfulToolOrArtifact = true;
                }
            }

            if (effectiveHandoffSelection && protocolHandoffExecuted && !fullContent.trim()) {
                fullContent = `Proposed protocol handoff for Question ${effectiveHandoffSelection.index}: "${effectiveHandoffSelection.question}". Review and accept the protocol proposal card to continue in Protocol mode.`;
                yield { type: "content", content: fullContent, conversationId: conversation.id };
            }

            if (forcedClarificationStop) {
                fullContent = forcedClarificationStop.content;
                await markRunAbnormalEndClassification(activeRun.id, "no_forward_durable_progress", {
                    requireActive: true,
                }).catch((markError) => {
                    if (isRunOwnershipError(markError)) {
                        return;
                    }
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
                const titleSeed = firstPersistedUserMessage || persistedUserContentForTitle || userMessage;
                const fallbackConversationTitle = !executionMode
                    && historicalAssistantCount === 0
                    && titleSeed.trim()
                    ? buildFallbackConversationTitle(titleSeed)
                    : undefined;
                const persistedAssistantMessage = await addAssistantMessageToConversationForRun({
                    runId: activeRun.id,
                    conversationId: conversation.id,
                    content: fullContent,
                    fallbackConversationTitle,
                });
                // Keep bookkeeping off the terminal delivery path while giving
                // the serverless runtime time to finish it after the response.
                const memoriesToAttribute = [...retrievedMemoriesForRun];
                const answerForAttribution = fullContent;
                schedulePostResponseTask({
                    taskName: "memory-use attribution",
                    conversationId: conversation.id,
                    runId: activeRun.id,
                    task: () => markMemoriesUsedInAnswer(memoriesToAttribute, answerForAttribution),
                });

                if (persistedAssistantMessage.conversationTitle) {
                    const durableFallbackTitle = persistedAssistantMessage.conversationTitle;
                    // The deterministic title is committed with the assistant
                    // message, so it is immediately visible even if refinement
                    // is slow or the serverless request ends.
                    try {
                        after(async () => {
                            try {
                                await this.maybeGenerateConversationTitle({
                                    conversationId: conversation.id,
                                    projectId: projectId || undefined,
                                    historicalAssistantCount,
                                    firstUserMessage: titleSeed,
                                    assistantMessage: fullContent,
                                    fallbackTitle: durableFallbackTitle,
                                    signal: executionSignal,
                                });
                            } catch (error) {
                                logServerWarn("ai-service", "failed to refine conversation title", {
                                    conversationId: conversation.id,
                                    runId: activeRun.id,
                                    error: error instanceof Error ? error.message : String(error),
                                });
                            }
                        });
                    } catch (error) {
                        // The durable fallback remains authoritative when the
                        // runtime has no request-scoped after() context.
                        logServerWarn("ai-service", "conversation title refinement was not scheduled", {
                            conversationId: conversation.id,
                            runId: activeRun.id,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    }
                    yield {
                        type: "conversation_title",
                        conversationId: conversation.id,
                        conversationTitle: durableFallbackTitle,
                    };
                }
            } else {
                const noAnswerOutcome = deriveRunOutcome({
                    facts: runFacts,
                    stopReason: finalStopReason,
                });
                if (noAnswerOutcome.runStatus === "failed" && !runFacts.hadSuccessfulToolOrArtifact) {
                    finalStopReason = noAnswerOutcome.stopReason;
                    fullContent = buildFailureFallbackMessage(stopReasonMessage(finalStopReason as StopReason));
                    await addAssistantMessageToConversationForRun({
                        runId: activeRun.id,
                        conversationId: conversation.id,
                        content: fullContent,
                    });
                    yield { type: "content", content: fullContent, conversationId: conversation.id };
                }
            }

            if (scopingReportPayload) {
                const topic = scopingReportPayload.topic?.trim();
                const title = topic ? `Scoping: ${topic}`.slice(0, 120) : "Scoping Report";
                const artifact = await createAutoAppliedArtifact({
                    runId: activeRun.id,
                    projectId: projectId || null,
                    conversationId: conversation.id,
                    userId,
                    type: "scoping_report",
                    title,
                    payload: scopingReportPayload,
                    applyId: `scoping-report:${activeRun.id}`,
                });

                yield {
                    type: "artifact",
                    artifactId: artifact.id,
                    artifactType: "scoping_report",
                    artifactStatus: artifact.status,
                    artifactTitle: artifact.title,
                    artifactPayload: artifact.payload,
                    artifactVersion: artifact.version,
                    conversationId: conversation.id,
                };
                runFacts.hadSuccessfulToolOrArtifact = true;
            }

            const finalOutcome = deriveRunOutcome({
                facts: runFacts,
                stopReason: finalStopReason,
            });
            finalStopReason = finalOutcome.stopReason;
            const runStatus = finalOutcome.runStatus;

            const finalized = await finalizeRunOnce(runStatus, totalTokensIn, totalTokensOut);
            if (!finalized) {
                await closeTraceOnce({
                    externallyFinalized: true,
                    attemptedRunStatus: runStatus,
                    stopReason: finalStopReason,
                });
                return;
            }

            // Trigger auto-summarization only after the authoritative run outcome is durable.
            // Auxiliary follow-on work must never retro-fail an already completed answer.
            const totalMsgs = conversation.messages.length + 2; // +user +assistant
            const currentTokens = estimateMessagesTokensWithSafetyMargin(conversation.messages);
            schedulePostResponseTask({
                taskName: "auto-summarization",
                conversationId: conversation.id,
                runId: activeRun.id,
                task: () => autoSummarizeIfNeeded(
                    conversation.id,
                    totalMsgs,
                    conversation.summaryData?.messageCount ?? 0,
                    budget,
                    currentTokens,
                ),
            });

            try {
                await closeTraceOnce({
                    stopReason: finalStopReason,
                    iterations: loop.iterations,
                    toolCalls: loop.totalToolCalls,
                    totalTokensIn,
                    totalTokensOut,
                    scopingSearchCalls: scopingSearchCallsThisRun,
                    protocolHandoffExecuted,
                });
            } catch (error) {
                logServerWarn("ai-service", "failed to close trace after run completion", {
                    conversationId: conversation.id,
                    runId: activeRun.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }

            const runModelMeta = resolveRunActualModelMeta(baseChatOptions.model, observedRunModel, invokedModel);
            const terminalStatus = finalizedRunStatus ?? runStatus;
            yield {
                type: "run_end",
                runId: activeRun.id,
                runStatus: terminalStatus,
                runCostTokensIn: totalTokensIn,
                runCostTokensOut: totalTokensOut,
                stopReason: stopReasonForTerminalStatus(terminalStatus, finalStopReason),
                iterationCount: loop.iterations,
                toolCallCount: loop.totalToolCalls,
                conversationId: conversation.id,
                actualModel: runModelMeta.actualModel ?? undefined,
                actualModelSource: runModelMeta.actualModelSource,
                actualProvider: observedRunProvider ?? undefined,
                actualReasoningEffort: observedRunReasoningEffort,
                actualDeliveryMode: observedRunDeliveryMode,
            };
        } catch (error) {
            const isAbortError =
                executionSignal?.aborted ||
                isAbortLikeError(error);
            const isWallTimeAbort = Boolean(
                runLoopDeadline?.timedOut()
                && isAbortLikeError(error)
                && !executionSignal?.aborted,
            );

            if (isRunOwnershipError(error)) {
                logServerWarn("ai-service", "run ownership lost during stream; suppressing stale writer", {
                    runId: error.runId,
                    status: error.status,
                    finalizationState: error.finalizationState,
                });
                const terminalStatus = isTerminalRunStatus(error.status)
                    ? error.status
                    : await inspectPersistedTerminalRunStatus(error.runId);
                if (terminalStatus) {
                    runFinalized = true;
                    finalizedRunStatus = terminalStatus;
                    const runModelMeta = resolveRunActualModelMeta(options?.model, observedRunModel, invokedModel);
                    yield {
                        type: "run_end",
                        runId: error.runId,
                        runStatus: terminalStatus,
                        stopReason: stopReasonForTerminalStatus(terminalStatus),
                        conversationId: conversation.id,
                        actualModel: runModelMeta.actualModel ?? undefined,
                        actualModelSource: runModelMeta.actualModelSource,
                        actualProvider: observedRunProvider ?? undefined,
                        actualReasoningEffort: observedRunReasoningEffort,
                        actualDeliveryMode: observedRunDeliveryMode,
                    };
                }
                await closeTraceOnce({
                    externallyFinalized: true,
                    runId: error.runId,
                    status: error.status,
                    finalizationState: error.finalizationState,
                });
                return;
            }

            if (isWallTimeAbort) {
                const activeRunId = run?.id;
                const errorMeta: AIErrorEnvelope = {
                    kind: "runtime",
                    code: "AGENT_LOOP_WALL_TIME_EXCEEDED",
                    retryable: true,
                    source: "runtime",
                    message: "The agent reached its wall-time budget before the current provider or tool operation completed.",
                };
                const terminalErrorChunk = buildStreamErrorChunk(errorMeta, {
                    conversationId: conversation.id,
                });
                await persistRecoveryErrorChunk(terminalErrorChunk);
                if (activeRunId) {
                    await markRunAbnormalEndClassification(activeRunId, "unknown", {
                        requireActive: true,
                    }).catch((markError) => {
                        if (!isRunOwnershipError(markError)) {
                            logServerError("ai-service", "failed to persist wall-time abnormal classification", {
                                runId: activeRunId,
                                error: markError,
                            });
                        }
                    });
                }
                await closeTraceOnce({ wallTimeBudgetExceeded: true });
                const finalized = await finalizeRunOnce("failed");
                yield terminalErrorChunk;
                if (activeRunId && finalized) {
                    const terminalStatus = finalizedRunStatus ?? "failed";
                    const runModelMeta = resolveRunActualModelMeta(options?.model, observedRunModel, invokedModel);
                    yield {
                        type: "run_end",
                        runId: activeRunId,
                        runStatus: terminalStatus,
                        stopReason: "wall_time",
                        conversationId: conversation.id,
                        actualModel: runModelMeta.actualModel ?? undefined,
                        actualModelSource: runModelMeta.actualModelSource,
                        actualProvider: observedRunProvider ?? undefined,
                        actualReasoningEffort: observedRunReasoningEffort,
                        actualDeliveryMode: observedRunDeliveryMode,
                    };
                }
                return;
            }

            if (isAbortError) {
                runFacts.cancelledByUser = true;
                const isSemanticRunCancel =
                    Boolean(runExecutionCancellation?.signal.aborted)
                    && !options?.signal?.aborted;
                const activeRunId = run?.id;
                // A durable semantic cancel owns the terminal state. Do not race
                // it with a stale partial assistant write from the aborted worker.
                if (fullContent && !isSemanticRunCancel) {
                    if (activeRunId) {
                        try {
                            await addAssistantMessageToConversationForRun({
                                runId: activeRunId,
                                conversationId: conversation.id,
                                content: fullContent,
                            });
                        } catch (writeError) {
                            if (!isRunOwnershipError(writeError)) {
                                throw writeError;
                            }
                            logServerWarn("ai-service", "partial assistant write lost run ownership during abort", {
                                runId: activeRunId,
                                status: writeError.status,
                            });
                        }
                    }
                }

                await closeTraceOnce({ aborted: true, semanticRunCancel: isSemanticRunCancel });
                if (activeRunId && !isSemanticRunCancel) {
                    await markRunAbnormalEndClassification(activeRunId, "client_abort", {
                        requireActive: true,
                    }).catch((markError) => {
                        if (isRunOwnershipError(markError)) {
                            return;
                        }
                        logServerError("ai-service", "failed to persist client abort classification", {
                            runId: activeRunId,
                            error: markError,
                        });
                    });
                }
                const finalized = await finalizeRunOnce("cancelled");
                const runModelMeta = resolveRunActualModelMeta(options?.model, observedRunModel, invokedModel);
                if (activeRunId && finalized) {
                    const terminalStatus = finalizedRunStatus ?? "cancelled";
                    yield {
                        type: "run_end",
                        runId: activeRunId,
                        runStatus: terminalStatus,
                        stopReason: stopReasonForTerminalStatus(terminalStatus, "cancelled"),
                        conversationId: conversation.id,
                        actualModel: runModelMeta.actualModel ?? undefined,
                        actualModelSource: runModelMeta.actualModelSource,
                        actualProvider: observedRunProvider ?? undefined,
                        actualReasoningEffort: observedRunReasoningEffort,
                        actualDeliveryMode: observedRunDeliveryMode,
                    };
                }
                return;
            }

            // ── Plan execution failure finalization ──
            if (executionMode && options?.planId && planData && planExecutionAttemptId) {
                try {
                    const { failPlanExecution } = await import("@/lib/server/agent/plan-execution");
                    for (const step of stepQueue) {
                        if (!step.consumed) step.finalStatus = "failed";
                    }
                    const finalSteps = planData.plan.steps.map((s, i) => {
                        const queued = stepQueue.find(q => q.originalIndex === i);
                        return { ...s, status: queued?.finalStatus ?? s.status };
                    });
                    await failPlanExecution(
                        options.planId,
                        finalSteps,
                        error instanceof Error ? error.message : "Unknown error",
                        planExecutionAttemptId,
                    );
                    planExecutionSettled = true;
                } catch (planError) {
                    // Best-effort — don't mask the original error
                    logServerError("ai-service", "failed to persist plan execution failure", {
                        planId: options.planId,
                        runId: run?.id ?? null,
                    }, planError);
                }
            }

            // End trace + run with failure
            await closeTraceOnce({ error: error instanceof Error ? error.message : "Unknown" });
            if (run?.id) {
                const activeRunId = run.id;
                await markRunAbnormalEndClassification(run.id, "unknown", {
                    requireActive: true,
                }).catch((markError) => {
                    if (isRunOwnershipError(markError)) {
                        return;
                    }
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
                const activeRunId = run?.id;
                if (activeRunId) {
                    await addAssistantMessageToConversationForRun({
                        runId: activeRunId,
                        conversationId: conversation.id,
                        content: fallbackContent,
                    });
                }
                // The structured terminal error below is the single live error.
                // Keep the persisted fallback for reload without duplicating it in-stream.
            }

            const finalized = await finalizeRunOnce("failed");
            if (!finalized) {
                return;
            }
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
            const runModelMeta = resolveRunActualModelMeta(options?.model, observedRunModel, invokedModel);
            if (run) {
                const terminalStatus = finalizedRunStatus ?? "failed";
                yield {
                    type: "run_end",
                    runId: run.id,
                    runStatus: terminalStatus,
                    stopReason: stopReasonForTerminalStatus(terminalStatus, "error"),
                    conversationId: conversation.id,
                    actualModel: runModelMeta.actualModel ?? undefined,
                    actualModelSource: runModelMeta.actualModelSource,
                    actualProvider: observedRunProvider ?? undefined,
                    actualReasoningEffort: observedRunReasoningEffort,
                    actualDeliveryMode: observedRunDeliveryMode,
                };
            }
        } finally {
            if (
                executionMode
                && options?.planId
                && planData
                && planExecutionAttemptId
                && !planExecutionSettled
            ) {
                for (const step of stepQueue) {
                    if (!step.consumed) step.finalStatus = "failed";
                }
                const finalSteps = planData.plan.steps.map((step, index) => {
                    const queued = stepQueue.find((candidate) => candidate.originalIndex === index);
                    return { ...step, status: queued?.finalStatus ?? step.status };
                });
                try {
                    await failPlanExecution(
                        options.planId,
                        finalSteps,
                        "Execution ended before every selected step completed",
                        planExecutionAttemptId,
                    );
                    planExecutionSettled = true;
                } catch (planError) {
                    logServerError("ai-service", "failed to release unfinished plan execution lease", {
                        planId: options.planId,
                        runId: run?.id ?? null,
                        executionAttemptId: planExecutionAttemptId,
                    }, planError);
                }
            }
            runLoopDeadline?.dispose();
            runLoopDeadline = null;
            stopRunLivenessControllers();
            linkedExecutionCancellation?.dispose();
            linkedExecutionCancellation = null;
            runExecutionCancellation?.dispose();
            runExecutionCancellation = null;
            const fallbackStatus = runFacts.cancelledByUser || executionSignal?.aborted
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
            createToolAvailabilityPolicyMiddleware(),
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
