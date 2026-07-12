import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIStreamChunk, ToolDefinition } from "@/types/ai";

const mocks = vi.hoisted(() => {
  const trace = {
    update: vi.fn(),
    end: vi.fn(),
  };
  trace.update.mockImplementation(() => trace);
  const provider = {
    id: "mock-provider",
    name: "Mock Provider",
    models: [{ id: "gpt-5.2", name: "GPT-5.2", contextWindow: 128000, capabilities: ["chat"] as const }],
    chat: vi.fn(async (
      _messages?: unknown,
      _options?: { signal?: AbortSignal },
    ) => {
      void _messages;
      void _options;
      return {
        id: "resp-1",
        content: "provider content",
        model: "gpt-5.2",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    }),
    streamChat: vi.fn<(...args: unknown[]) => AsyncIterable<AIStreamChunk>>(async function* () {
      yield { type: "content", content: "provider content" };
      yield {
        type: "done",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        actualModel: "gpt-5.2",
      };
    }),
    isConfigured: vi.fn(() => true),
  };

  return {
    ensureConversationRunAvailability: vi.fn(),
    getConversationWithSummary: vi.fn(),
    getConversationWithSummaryById: vi.fn(),
    preparePlanExecution: vi.fn(),
    markPlanExecutionRunning: vi.fn(),
    failPlanExecution: vi.fn(),
    startRun: vi.fn(),
    getRun: vi.fn(),
    endRun: vi.fn(),
    startRunHeartbeat: vi.fn(() => ({ stop: vi.fn() })),
    runCancellationAbort: vi.fn(),
    runCancellationDispose: vi.fn(),
    durableRunCancellationStop: vi.fn(),
    registerActiveRunExecutionCancellation: vi.fn(),
    startDurableRunCancellationMonitor: vi.fn(),
    markRunFinalizationState: vi.fn(),
    markRunFinalizationFailed: vi.fn(),
    markRunAbnormalEndClassification: vi.fn(),
    recordRunGenerationReceipt: vi.fn(async () => {}),
    isRunOwnershipError: vi.fn(() => false),
    after: vi.fn(),
    startRunTrace: vi.fn(() => trace),
    flushTracing: vi.fn(),
    addAssistantMessageToConversationForRun: vi.fn(async (
      params?: { fallbackConversationTitle?: string },
    ) => ({
      id: "msg-1",
      role: "assistant",
      content: "assistant content",
      createdAt: new Date("2026-03-11T12:00:00.000Z").toISOString(),
      ...(params?.fallbackConversationTitle
        ? { conversationTitle: params.fallbackConversationTitle }
        : {}),
    })),
    autoSummarizeIfNeeded: vi.fn(async () => {}),
    markMemoriesUsedInAnswer: vi.fn(async () => {}),
    aiConversationFindUnique: vi.fn(),
    aiConversationUpdateMany: vi.fn(),
    resolveAuthenticatedIdentity: vi.fn(),
    reserveProviderUsageAttempt: vi.fn(),
    trySettleUsageReservation: vi.fn(),
    tryMarkUsageReservationReconcilable: vi.fn(),
    getProviderModelId: vi.fn((modelId: string) => modelId),
    getContextualToolDefinitions: vi.fn<() => ToolDefinition[]>(() => []),
    evaluateToolPrerequisites: vi.fn(),
    preRecordToolCallBatchForAutonomy: vi.fn(),
    executeToolWithAutonomy: vi.fn(),
    trace,
    provider,
  };
});

vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock("@/lib/server/ai/providers", () => ({
  BaseAIProvider: class {},
  getOpenAIProvider: () => mocks.provider,
  getAnthropicProvider: () => ({ isConfigured: () => false }),
  getXAIProvider: () => ({ isConfigured: () => false }),
  getGoogleProvider: () => ({ isConfigured: () => false }),
  getGatewayProvider: () => ({ isConfigured: () => false }),
}));

vi.mock("@/lib/server/ai/rate-limiter", () => ({
  reserveProviderUsageAttempt: mocks.reserveProviderUsageAttempt,
  trySettleUsageReservation: mocks.trySettleUsageReservation,
  tryMarkUsageReservationReconcilable:
    mocks.tryMarkUsageReservationReconcilable,
}));

vi.mock("@/lib/server/ai/memory", () => ({
  getOrCreateConversation: vi.fn(),
  addAssistantMessageToConversationForRun: mocks.addAssistantMessageToConversationForRun,
  addMessageToConversation: vi.fn(),
  getConversationWithSummary: mocks.getConversationWithSummary,
  getConversationWithSummaryById: mocks.getConversationWithSummaryById,
  autoSummarizeIfNeeded: mocks.autoSummarizeIfNeeded,
}));

vi.mock("@/lib/server/memory", () => ({
  retrieveMemories: vi.fn(async () => []),
  formatMemoriesForContext: vi.fn(() => ""),
  markMemoriesUsedInAnswer: mocks.markMemoriesUsedInAnswer,
}));

vi.mock("@/lib/ai/config", () => ({
  AI_CONFIG: {
    defaultProvider: "mock-provider",
    defaultModel: "gpt-5.2",
    defaultMaxTokens: 2_048,
    defaultTemperature: 0.7,
  },
  getModelCapabilityRecord: vi.fn(() => undefined),
  getProviderForModel: vi.fn(() => "mock-provider"),
  getProviderModelId: mocks.getProviderModelId,
  getDefaultReasoningEffort: vi.fn(() => "medium"),
  getContextBudget: vi.fn(() => 8000),
}));

vi.mock("@/lib/server/ai/background-model-policy", () => ({
  getBackgroundModel: vi.fn(() => "gpt-5.2"),
}));

vi.mock("@/lib/agent/compaction", () => ({
  buildModelVisibleToolResult: vi.fn(),
  compactToolResult: vi.fn(),
  compactLoopMessages: vi.fn((messages) => ({ messages, removed: 0 })),
  buildCompactedHistory: vi.fn((messages) => messages),
  estimateMessagesTokensWithSafetyMargin: vi.fn(() => 0),
  formatSummaryAsMessage: vi.fn(() => ""),
  repairConversationHistory: vi.fn((messages) => ({ messages })),
}));

vi.mock("@/lib/server/ai/tools", () => ({
  AVAILABLE_TOOLS: [],
  getToolDefinitions: vi.fn(() => []),
  executeTool: vi.fn(),
}));

vi.mock("@/lib/server/agent/run", () => ({
  startRun: mocks.startRun,
  getRun: mocks.getRun,
  endRun: mocks.endRun,
  startRunHeartbeat: mocks.startRunHeartbeat,
  markRunFinalizationState: mocks.markRunFinalizationState,
  markRunFinalizationFailed: mocks.markRunFinalizationFailed,
  markRunAbnormalEndClassification: mocks.markRunAbnormalEndClassification,
  recordRunGenerationReceipt: mocks.recordRunGenerationReceipt,
  isRunOwnershipError: mocks.isRunOwnershipError,
}));

vi.mock("@/lib/server/agent/run-cancellation", () => ({
  registerActiveRunExecutionCancellation: mocks.registerActiveRunExecutionCancellation,
  startDurableRunCancellationMonitor: mocks.startDurableRunCancellationMonitor,
}));

vi.mock("@/lib/server/agent/events", () => ({
  emitEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
  createArtifact: vi.fn(),
}));

vi.mock("@/lib/server/agent/plan-execution", () => ({
  preparePlanExecution: mocks.preparePlanExecution,
  markPlanExecutionRunning: mocks.markPlanExecutionRunning,
  failPlanExecution: mocks.failPlanExecution,
  resolvePlanExecutionToolNames: vi.fn(() => ({
    allowedToolNames: ["search_pubmed"],
    unavailableToolNames: [],
  })),
  assertNextPlanToolCall: vi.fn(),
}));

vi.mock("@/lib/server/agent/autonomy", () => ({
  getAutonomyConfig: vi.fn(async () => ({ preset: "assisted", toolOverrides: {} })),
}));

vi.mock("@/lib/ai/prompts/assistant-prompts", () => ({
  assembleSystemPrompt: vi.fn(() => "system"),
  buildProjectContext: vi.fn(() => ""),
  buildProtocolContext: vi.fn(() => ""),
  buildProtocolPointerContext: vi.fn(() => ""),
  buildLedgerContext: vi.fn(() => ""),
  buildLedgerPointerContext: vi.fn(() => ""),
  buildAutonomyContext: vi.fn(() => ""),
  buildLocationContext: vi.fn(() => ""),
  buildStudyContext: vi.fn(() => ""),
}));

vi.mock("@/lib/agent/feature-flags", () => ({
  normalizeAgentMode: vi.fn((mode: string) => mode),
}));

vi.mock("@/lib/agent/loop-controller", () => ({
  LoopState: class {
    iterations = 0;
    totalToolCalls = 0;
    stopReason = "natural";
    shouldContinue() {
      if (this.iterations === 0) {
        this.iterations += 1;
        return { continue: true, stopReason: "natural" };
      }
      return { continue: false, stopReason: "natural" };
    }
    markStopped(reason: string) {
      this.stopReason = reason;
    }
    recordToolCalls() {
      return false;
    }
  },
}));

vi.mock("@/lib/server/ai/tracing", () => ({
  startRunTrace: mocks.startRunTrace,
  startLLMGeneration: vi.fn(() => ({ update: vi.fn(), end: vi.fn() })),
  startContextSpan: vi.fn(() => ({ update: vi.fn(() => ({ end: vi.fn() })) })),
  flushTracing: mocks.flushTracing,
}));

vi.mock("@/lib/server/ai/choices-extractor", () => ({
  withChoicesExtraction: vi.fn((stream) => stream),
}));

vi.mock("@/lib/server/ai/title-generator", () => ({
  sanitizeGeneratedConversationTitle: vi.fn((value: string) => value),
  buildFallbackConversationTitle: vi.fn(() => "Fallback"),
}));

vi.mock("@/lib/server/ai/scoping", () => ({
  detectScopingHandoffSelection: vi.fn(() => null),
  extractLatestScopingReport: vi.fn(() => null),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    aIConversation: {
      findUnique: mocks.aiConversationFindUnique,
      updateMany: mocks.aiConversationUpdateMany,
    },
    protocol: { findFirst: vi.fn(async () => null) },
    study: { findUnique: vi.fn(async () => null) },
    project: { findUnique: vi.fn(async () => null) },
    artifact: { update: vi.fn(async () => null) },
  },
}));

vi.mock("@/types/protocol", () => ({
  isProtocolPopulated: vi.fn(() => false),
}));

vi.mock("@/lib/server/chat-runtime/conversation-run-lock", () => ({
  ensureConversationRunAvailability: mocks.ensureConversationRunAvailability,
}));

vi.mock("@/lib/server/ai/error-classification", () => ({
  classifyAIError: vi.fn((error: unknown) => {
    const errorMeta = error && typeof error === "object" && "errorMeta" in error
      ? (error as { errorMeta?: Record<string, unknown> }).errorMeta
      : undefined;
    if (errorMeta) {
      return {
        message: errorMeta.message,
        retryable: errorMeta.retryable,
        reason: "timeout",
        kind: errorMeta.kind,
        source: errorMeta.source,
        code: errorMeta.code,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/Connection terminated due to connection timeout/i.test(message)) {
      return {
        message,
        retryable: true,
        reason: "timeout",
        kind: "database_connection",
        source: "database_connection",
        code: "DATABASE_CONNECTION_TIMEOUT",
      };
    }
    if (/Can't reach database server|ECONNREFUSED|connection refused/i.test(message)) {
      return {
        message,
        retryable: true,
        reason: "timeout",
        kind: "database_connection",
        source: "database_connection",
        code: "DATABASE_CONNECTION_FAILED",
      };
    }
    return {
      message,
      retryable: false,
      reason: "unknown",
    };
  }),
  toAIErrorEnvelope: vi.fn((error: unknown, envelope: Record<string, unknown>) => {
    const errorMeta = error && typeof error === "object" && "errorMeta" in error
      ? (error as { errorMeta?: Record<string, unknown> }).errorMeta
      : undefined;
    if (errorMeta) {
      return { ...envelope, ...errorMeta };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/Connection terminated due to connection timeout/i.test(message)) {
      return {
        ...envelope,
        kind: "database_connection",
        source: "database_connection",
        code: "DATABASE_CONNECTION_TIMEOUT",
        retryable: true,
        message,
      };
    }
    if (/Can't reach database server|ECONNREFUSED|connection refused/i.test(message)) {
      return {
        ...envelope,
        kind: "database_connection",
        source: "database_connection",
        code: "DATABASE_CONNECTION_FAILED",
        retryable: true,
        message,
      };
    }
    return envelope;
  }),
}));

vi.mock("@/lib/server/utils/retry", () => ({
  retryAsync: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  sleep: vi.fn(async () => {}),
}));

vi.mock("@/lib/ai/reasoning-visibility", () => ({
  resolveReasoningMode: vi.fn(),
}));

vi.mock("@/lib/server/ai/tool-middleware", () => ({
  createIdempotencyMiddleware: vi.fn(() => ({})),
  executeWithToolMiddleware: vi.fn(),
}));

vi.mock("@/lib/server/ai/tool-prerequisites", () => ({
  createToolPrerequisiteMiddleware: vi.fn(() => ({})),
  evaluateToolPrerequisites: mocks.evaluateToolPrerequisites,
}));

vi.mock("@/lib/server/auth/identity", () => ({
  resolveAuthenticatedIdentity: mocks.resolveAuthenticatedIdentity,
}));

vi.mock("@/lib/server/ledger-utils", () => ({
  computeLedgerCounts: vi.fn(async () => ({ total: 0, included: 0, excluded: 0, maybe: 0, unscreened: 0 })),
  computeStudyLedger: vi.fn(async () => ({ counts: { total: 0, included: 0, excluded: 0, maybe: 0, unscreened: 0 }, list: [], truncated: false, hasRecommendationSeeds: false })),
}));

vi.mock("@/lib/server/ai/tool-helpers", () => ({
  dropShadowedInvalidToolCalls: vi.fn((toolCalls: unknown[]) => ({ toolCalls, dropped: [] })),
  getToolCallRepeatKey: vi.fn(async () => "repeat-key"),
  mapToolToProgressMessage: vi.fn(() => "Working..."),
  isStudyLedgerSnapshot: vi.fn(() => false),
  getLedgerCounts: vi.fn(() => ({ total: 0, included: 0, excluded: 0, maybe: 0, unscreened: 0 })),
  emptyLedgerCounts: vi.fn(() => ({ total: 0, included: 0, excluded: 0, maybe: 0, unscreened: 0 })),
  buildScopingHandoffToolCall: vi.fn(),
  getLazyContextPointerCapabilities: vi.fn(() => ({ canReadProtocol: false, canReadLedger: false })),
  getContextualToolDefinitions: mocks.getContextualToolDefinitions,
  shouldUseScopingBatchPlan: vi.fn(() => false),
  buildScopingSearchPackPlan: vi.fn(),
  finalizeScopingResponse: vi.fn(({ fullContent }: { fullContent: string }) => ({ content: fullContent, report: null })),
}));

vi.mock("@/lib/server/ai/tool-autonomy", () => ({
  executeToolWithAutonomy: mocks.executeToolWithAutonomy,
  preRecordToolCallBatchForAutonomy: mocks.preRecordToolCallBatchForAutonomy,
}));

const { AIService } = await import("@/lib/server/ai/ai-service");
const { retrieveMemories } = await import("@/lib/server/memory");
const { getAutonomyConfig } = await import("@/lib/server/agent/autonomy");
const { prisma } = await import("@/lib/server/prisma");
const mockRetrieveMemories = vi.mocked(retrieveMemories);
const mockGetAutonomyConfig = vi.mocked(getAutonomyConfig);
const mockProtocolFindFirst = vi.mocked(prisma.protocol.findFirst);

describe("AIService run finalization", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.startRun.mockReset();
    mocks.getRun.mockReset();
    mocks.endRun.mockReset();
    mocks.markRunFinalizationState.mockReset();
    mocks.markRunFinalizationFailed.mockReset();
    mocks.markRunAbnormalEndClassification.mockReset();
    mocks.isRunOwnershipError.mockReset();
    mocks.after.mockReset();
    mocks.registerActiveRunExecutionCancellation.mockReset();
    mocks.startDurableRunCancellationMonitor.mockReset();
    mocks.provider.chat.mockReset();
    mocks.provider.streamChat.mockReset();
    mocks.ensureConversationRunAvailability.mockReset();
    mocks.getConversationWithSummary.mockReset();
    mocks.getConversationWithSummaryById.mockReset();
    mocks.preparePlanExecution.mockReset();
    mocks.markPlanExecutionRunning.mockReset();
    mocks.failPlanExecution.mockReset();
    mocks.addAssistantMessageToConversationForRun.mockReset();
    mocks.autoSummarizeIfNeeded.mockReset();
    mocks.markMemoriesUsedInAnswer.mockReset();
    mocks.aiConversationFindUnique.mockReset();
    mocks.aiConversationUpdateMany.mockReset();
    mocks.resolveAuthenticatedIdentity.mockReset();
    mocks.reserveProviderUsageAttempt.mockReset();
    mocks.trySettleUsageReservation.mockReset();
    mocks.tryMarkUsageReservationReconcilable.mockReset();
    mocks.getProviderModelId.mockReset();
    mocks.getContextualToolDefinitions.mockReset();
    mocks.evaluateToolPrerequisites.mockReset();
    mocks.preRecordToolCallBatchForAutonomy.mockReset();
    mocks.executeToolWithAutonomy.mockReset();
    mockRetrieveMemories.mockReset();
    mockGetAutonomyConfig.mockReset();
    mockProtocolFindFirst.mockReset();
    mocks.provider.chat.mockResolvedValue({
      id: "resp-1",
      content: "provider content",
      model: "gpt-5.2",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    mocks.provider.streamChat.mockImplementation(async function* () {
      yield { type: "content", content: "provider content" };
      yield {
        type: "done",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        actualModel: "gpt-5.2",
      };
    });
    mocks.ensureConversationRunAvailability.mockResolvedValue({ cancelledStaleRunCount: 0 });
    mocks.getConversationWithSummary.mockResolvedValue({
      id: "conv-1",
      projectId: "project-1",
      studyId: null,
      messages: [],
      summaryData: null,
    });
    mocks.getConversationWithSummaryById.mockResolvedValue({
      id: "conv-1",
      projectId: "project-1",
      studyId: null,
      messages: [],
      summaryData: null,
    });
    mocks.preparePlanExecution.mockResolvedValue(null);
    mocks.markPlanExecutionRunning.mockResolvedValue(undefined);
    mocks.failPlanExecution.mockResolvedValue(undefined);
    mocks.resolveAuthenticatedIdentity.mockReturnValue({ userId: "user-1", workspaceId: undefined });
    mocks.reserveProviderUsageAttempt.mockResolvedValue({
      id: "usage-reservation-1",
      reservedTokens: 1,
      status: "active",
    });
    mocks.trySettleUsageReservation.mockResolvedValue(true);
    mocks.tryMarkUsageReservationReconcilable.mockResolvedValue(true);
    mocks.getProviderModelId.mockImplementation((modelId: string) => modelId);
    mocks.getContextualToolDefinitions.mockReturnValue([]);
    mocks.evaluateToolPrerequisites.mockResolvedValue({ allowed: true, repeatKey: "repeat-key" });
    mocks.preRecordToolCallBatchForAutonomy.mockResolvedValue(new Map());
    mocks.startRun.mockResolvedValue({ id: "run-1" });
    mocks.getRun.mockResolvedValue({
      id: "run-1",
      status: "running",
      completedAt: null,
      finalizationState: "not_started",
    });
    mocks.endRun.mockResolvedValue({ id: "run-1", status: "failed" });
    mocks.runCancellationAbort.mockClear();
    mocks.runCancellationDispose.mockClear();
    mocks.durableRunCancellationStop.mockClear();
    mocks.registerActiveRunExecutionCancellation.mockReturnValue({
      signal: new AbortController().signal,
      abort: mocks.runCancellationAbort,
      dispose: mocks.runCancellationDispose,
    });
    mocks.startDurableRunCancellationMonitor.mockReturnValue({
      stop: mocks.durableRunCancellationStop,
    });
    mocks.markRunFinalizationState.mockResolvedValue(1);
    mocks.markRunFinalizationFailed.mockResolvedValue(1);
    mocks.markRunAbnormalEndClassification.mockResolvedValue(1);
    mocks.isRunOwnershipError.mockReturnValue(false);
    mocks.after.mockImplementation((task: (() => unknown | Promise<unknown>) | Promise<unknown>) => {
      if (typeof task === "function") {
        void task();
      }
    });
    mocks.addAssistantMessageToConversationForRun.mockImplementation(async (params) => ({
      id: "msg-1",
      role: "assistant",
      content: "assistant content",
      createdAt: new Date("2026-03-11T12:00:00.000Z").toISOString(),
      ...(params?.fallbackConversationTitle
        ? { conversationTitle: params.fallbackConversationTitle }
        : {}),
    }));
    mocks.autoSummarizeIfNeeded.mockResolvedValue(undefined);
    mocks.markMemoriesUsedInAnswer.mockResolvedValue(undefined);
    mocks.aiConversationFindUnique.mockResolvedValue({ title: "Existing title" });
    mocks.aiConversationUpdateMany.mockResolvedValue({ count: 0 });
    mockRetrieveMemories.mockResolvedValue([]);
    mockGetAutonomyConfig.mockResolvedValue({ preset: "assisted", toolOverrides: {} } as never);
    mockProtocolFindFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("finalizes a started run when the stream is closed after run_start", async () => {
    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });
    const iterator = stream[Symbol.asyncIterator]();

    const first = await iterator.next();

    expect(first.done).toBe(false);
    expect(first.value?.type).toBe("run_start");
    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        projectId: "project-1",
        userId: "user-1",
      }),
    );

    await iterator.return?.(undefined);

    expect(mocks.endRun).toHaveBeenCalledTimes(1);
    expect(mocks.markRunFinalizationState).toHaveBeenCalledWith("run-1", "in_progress");
    expect(mocks.endRun).toHaveBeenCalledWith("run-1", "failed", undefined, undefined);
    expect(mocks.trace.end).toHaveBeenCalledTimes(1);
    expect(mocks.trace.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        forcedFinalization: true,
        finalRunStatus: "failed",
      }),
    });
  });

  it("uses plan metadata conversation and mode as the execution authority", async () => {
    mocks.preparePlanExecution.mockResolvedValue({
      plan: {
        steps: [{ label: "Search", toolName: "search_pubmed", status: "pending" }],
        estimatedActions: 1,
        execution: {
          originAgentMode: "search",
          allowedToolNames: ["search_pubmed", "ask_user"],
          createdFromConversationId: "conv-plan",
          createdFromProjectId: "project-1",
          enforceOrder: true,
        },
      },
      selectedSteps: [{ originalIndex: 0, label: "Search", toolName: "search_pubmed" }],
      conversationId: "conv-plan",
      projectId: "project-1",
      originAgentMode: "search",
      allowedToolNames: ["search_pubmed", "ask_user"],
    });
    mocks.getConversationWithSummaryById.mockResolvedValue({
      id: "conv-plan",
      projectId: "project-1",
      studyId: null,
      messages: [],
      summaryData: null,
    });

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("", "project", {
      planId: "plan-1",
      selectedSteps: [0],
      conversationId: "conv-client-stale",
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();

    expect(first.done).toBe(false);
    expect(first.value?.type).toBe("run_start");
    expect(mocks.getConversationWithSummaryById).toHaveBeenCalledWith(
      "conv-plan",
      "user-1",
      undefined,
    );
    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agentMode: "search",
        conversationId: "conv-plan",
      }),
    );

    await iterator.return?.(undefined);
  });

  it("fails closed when an authoritative conversation read never settles", async () => {
    vi.useFakeTimers();
    mocks.getConversationWithSummaryById.mockImplementationOnce(() => new Promise(() => {}));
    const service = new AIService();
    const iterator = service.streamChatWithArtifacts("hello", "project", {
      conversationId: "conv-1",
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    })[Symbol.asyncIterator]();
    const next = iterator.next();
    const rejection = expect(next).rejects.toMatchObject({
      errorCode: "CRITICAL_CONTEXT_BRANCH_TIMEOUT",
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(mocks.startRun).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails a started run when the critical autonomy read never settles", async () => {
    vi.useFakeTimers();
    mockGetAutonomyConfig.mockImplementationOnce(() => new Promise(() => {}));
    const service = new AIService();
    const iterator = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    })[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "run_start", runId: "run-1" },
    });
    const errorChunk = iterator.next();

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(errorChunk).resolves.toMatchObject({
      value: {
        type: "error",
        errorMeta: { code: "CRITICAL_CONTEXT_BRANCH_TIMEOUT", retryable: true },
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "run_end", runStatus: "failed", stopReason: "error" },
    });
    expect(mocks.endRun).toHaveBeenCalledWith("run-1", "failed", undefined, undefined);
  });

  it("starts continuation runs in verify phase", async () => {
    const service = new AIService();
    const stream = service.streamChatWithArtifacts("Continue", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
      continuationContext: "[CONTINUATION_CONTEXT]\nPersisted checkpoint",
    });
    const iterator = stream[Symbol.asyncIterator]();

    const first = await iterator.next();

    expect(first.done).toBe(false);
    expect(first.value?.type).toBe("run_start");
    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        projectId: "project-1",
        initialPhase: "verify",
      }),
    );

    await iterator.return?.(undefined);
  });

  it("routes artifact generations through durable admission and exactly-once usage settlement", async () => {
    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
      reasoningEffort: "medium",
      deliveryMode: "standard",
    });

    for await (const chunk of stream) {
      if (chunk.type === "run_end") break;
    }

    expect(mocks.reserveProviderUsageAttempt).toHaveBeenCalledWith(expect.objectContaining({
      scope: {
        projectId: "project-1",
        userId: "user-1",
        workspaceId: null,
      },
      provider: "mock-provider",
      model: "gpt-5.2",
      source: "project_copilot",
      conversationId: "conv-1",
    }));
    expect(mocks.trySettleUsageReservation).toHaveBeenCalledWith(expect.objectContaining({
      reservationId: "usage-reservation-1",
      model: "gpt-5.2",
      provider: "mock-provider",
      requestedModel: "gpt-5.2",
      requestedProvider: "mock-provider",
      requestedReasoningEffort: "medium",
      requestedDeliveryMode: "standard",
      inputTokens: 1,
      outputTokens: 1,
    }));
  });

  it("does not persist requested routing as provider-observed generation metadata", async () => {
    mocks.getProviderModelId.mockReturnValueOnce("openai/gpt-5.2");
    mocks.provider.streamChat.mockImplementationOnce(async function* () {
      yield { type: "content", content: "provider content" };
      yield {
        type: "done",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        actualModel: "",
      };
    });

    const service = new AIService();
    const chunks: Array<{
      type?: string;
      actualModel?: string;
      actualModelSource?: string;
    }> = [];
    for await (const chunk of service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    })) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(mocks.recordRunGenerationReceipt).toHaveBeenCalledWith("run-1", expect.objectContaining({
      actualModel: null,
      actualProvider: null,
    }));
    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      actualModel: "openai/gpt-5.2",
      actualModelSource: "requested",
    });
  });

  it("continues with a checkpoint when memories degrade after authority succeeds", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    mockRetrieveMemories.mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"));

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; checkpointLabel?: string; content?: string }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(chunks.map((chunk) => chunk.type)).toContain("checkpoint");
    expect(chunks.find((chunk) => chunk.type === "checkpoint")).toMatchObject({
      checkpointLabel: "Continuing with reduced context due to a temporary database issue.",
    });
    expect(chunks.findIndex((chunk) => chunk.type === "checkpoint")).toBeLessThan(
      chunks.findIndex((chunk) => chunk.type === "content"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[ai/context-assembly] branch failed",
      expect.objectContaining({
        branch: "memories",
        critical: false,
        failureClass: "database_connection_timeout",
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[ai/context-assembly] summary",
      expect.objectContaining({
        degraded: true,
      }),
    );

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("continues when protocol context fails after authority succeeds", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProtocolFindFirst.mockRejectedValueOnce(new Error("Can't reach database server at localhost:5432"));

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; checkpointLabel?: string }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(chunks.find((chunk) => chunk.type === "checkpoint")).toMatchObject({
      checkpointLabel: "Continuing with reduced context due to a temporary database issue.",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[ai/context-assembly] branch failed",
      expect.objectContaining({
        branch: "protocol",
        critical: false,
        failureClass: "database_connection_failed",
      }),
    );

    warnSpy.mockRestore();
  });

  it("fails when autonomy config cannot be loaded", async () => {
    mockGetAutonomyConfig.mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"));

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; errorMeta?: { kind?: string; code?: string } }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(chunks.find((chunk) => chunk.type === "error")).toMatchObject({
      errorMeta: {
        kind: "database_connection",
        source: "database_connection",
        code: "DATABASE_CONNECTION_TIMEOUT",
      },
    });
    expect(mocks.markRunAbnormalEndClassification).toHaveBeenCalledWith("run-1", "unknown", {
      requireActive: true,
    });
  });

  it("does not retro-fail a completed run when auto-summarization throws", async () => {
    mocks.autoSummarizeIfNeeded.mockRejectedValueOnce(new Error("summary write failed"));

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; runStatus?: string; stopReason?: string }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "completed",
      stopReason: "natural",
    });
    expect(mocks.endRun).toHaveBeenCalledWith("run-1", "completed", expect.any(Number), expect.any(Number));
    expect(mocks.markRunFinalizationFailed).not.toHaveBeenCalled();
  });

  it("registers memory attribution and auto-summarization as post-response work", async () => {
    const scheduledTasks: Array<() => unknown | Promise<unknown>> = [];
    mocks.after.mockImplementation((task: (() => unknown | Promise<unknown>) | Promise<unknown>) => {
      if (typeof task === "function") scheduledTasks.push(task);
    });
    mocks.addAssistantMessageToConversationForRun.mockResolvedValueOnce({
      id: "msg-1",
      role: "assistant",
      content: "assistant content",
      createdAt: new Date("2026-03-11T12:00:00.000Z").toISOString(),
    });

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; runStatus?: string }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "completed",
    });
    expect(scheduledTasks).toHaveLength(2);
    expect(mocks.markMemoriesUsedInAnswer).not.toHaveBeenCalled();
    expect(mocks.autoSummarizeIfNeeded).not.toHaveBeenCalled();

    await Promise.all(scheduledTasks.map((task) => task()));

    expect(mocks.markMemoriesUsedInAnswer).toHaveBeenCalledTimes(1);
    expect(mocks.autoSummarizeIfNeeded).toHaveBeenCalledTimes(1);
  });

  it("isolates and logs post-response task failures", async () => {
    const scheduledTasks: Array<() => unknown | Promise<unknown>> = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.after.mockImplementation((task: (() => unknown | Promise<unknown>) | Promise<unknown>) => {
      if (typeof task === "function") scheduledTasks.push(task);
    });
    mocks.addAssistantMessageToConversationForRun.mockResolvedValueOnce({
      id: "msg-1",
      role: "assistant",
      content: "assistant content",
      createdAt: new Date("2026-03-11T12:00:00.000Z").toISOString(),
    });
    mocks.markMemoriesUsedInAnswer.mockRejectedValueOnce(new Error("attribution write failed"));
    mocks.autoSummarizeIfNeeded.mockRejectedValueOnce(new Error("summary write failed"));

    try {
      const service = new AIService();
      const stream = service.streamChatWithArtifacts("hello", "project", {
        projectId: "project-1",
        userId: "user-1",
        agentMode: "general",
        model: "gpt-5.2",
      });

      const chunks: Array<{ type?: string; runStatus?: string }> = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
        if (chunk.type === "run_end") break;
      }

      expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
        runStatus: "completed",
      });
      await expect(Promise.all(scheduledTasks.map((task) => task()))).resolves.toEqual([
        undefined,
        undefined,
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        "[ai-service] memory-use attribution failed after response",
        expect.objectContaining({
          conversationId: "conv-1",
          runId: "run-1",
          error: "attribution write failed",
        }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "[ai-service] auto-summarization failed after response",
        expect.objectContaining({
          conversationId: "conv-1",
          runId: "run-1",
          error: "summary write failed",
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("keeps terminal delivery stable when post-response registration is unavailable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.after.mockImplementation(() => {
      throw new Error("after context unavailable");
    });
    mocks.addAssistantMessageToConversationForRun.mockResolvedValueOnce({
      id: "msg-1",
      role: "assistant",
      content: "assistant content",
      createdAt: new Date("2026-03-11T12:00:00.000Z").toISOString(),
    });

    try {
      const service = new AIService();
      const stream = service.streamChatWithArtifacts("hello", "project", {
        projectId: "project-1",
        userId: "user-1",
        agentMode: "general",
        model: "gpt-5.2",
      });

      const chunks: Array<{ type?: string; runStatus?: string }> = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
        if (chunk.type === "run_end") break;
      }

      expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
        runStatus: "completed",
      });
      expect(mocks.markMemoriesUsedInAnswer).not.toHaveBeenCalled();
      expect(mocks.autoSummarizeIfNeeded).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        "[ai-service] memory-use attribution was not scheduled",
        expect.objectContaining({ error: "after context unavailable" }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "[ai-service] auto-summarization was not scheduled",
        expect.objectContaining({ error: "after context unavailable" }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("delivers run_end without waiting for non-settling auto-summarization", async () => {
    mocks.autoSummarizeIfNeeded.mockImplementationOnce(() => new Promise(() => {}));

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; runStatus?: string }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "completed",
    });
    expect(mocks.endRun).toHaveBeenCalledWith("run-1", "completed", expect.any(Number), expect.any(Number));
  });

  it("delivers run_end without waiting for non-settling memory-use attribution", async () => {
    mocks.markMemoriesUsedInAnswer.mockImplementationOnce(() => new Promise(() => {}));

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; runStatus?: string }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "completed",
    });
    expect(mocks.endRun).toHaveBeenCalledWith("run-1", "completed", expect.any(Number), expect.any(Number));
  });

  it("[runtime-no-answer-failure-truth] fails a natural no-answer run instead of completing an empty assistant turn", async () => {
    mocks.provider.streamChat.mockImplementationOnce(async function* () {
      yield {
        type: "done",
        usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
        actualModel: "gpt-5.2",
      };
    });

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; content?: string; runStatus?: string; stopReason?: string }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(chunks.find((chunk) => chunk.type === "content")).toMatchObject({
      content: "I couldn't complete that request: An error occurred during processing.",
    });
    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "failed",
      stopReason: "error",
    });
    expect(mocks.endRun).toHaveBeenCalledWith("run-1", "failed", expect.any(Number), expect.any(Number));
  });

  it("does not retro-fail a completed run when conversation title generation throws", async () => {
    const titleSpy = vi.spyOn(
      AIService.prototype as unknown as {
        maybeGenerateConversationTitle: (params: unknown) => Promise<string | null>;
      },
      "maybeGenerateConversationTitle",
    ).mockRejectedValueOnce(new Error("title write failed"));

    try {
      const service = new AIService();

      const stream = service.streamChatWithArtifacts("hello", "project", {
        projectId: "project-1",
        userId: "user-1",
        agentMode: "general",
        model: "gpt-5.2",
      });

      const chunks: Array<{ type?: string; runStatus?: string; stopReason?: string }> = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
        if (chunk.type === "run_end") break;
      }

      expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
        runStatus: "completed",
        stopReason: "natural",
      });
      expect(mocks.trace.end).toHaveBeenCalledTimes(1);
      expect(mocks.endRun).toHaveBeenCalledWith("run-1", "completed", expect.any(Number), expect.any(Number));
      expect(mocks.markRunFinalizationFailed).not.toHaveBeenCalled();
    } finally {
      titleSpy.mockRestore();
    }
  });

  it("delivers run_end without waiting for non-settling title generation", async () => {
    const titleSpy = vi.spyOn(
      AIService.prototype as unknown as {
        maybeGenerateConversationTitle: (params: unknown) => Promise<string | null>;
      },
      "maybeGenerateConversationTitle",
    ).mockImplementationOnce(() => new Promise(() => {}));

    try {
      const service = new AIService();
      const stream = service.streamChatWithArtifacts("hello", "project", {
        projectId: "project-1",
        userId: "user-1",
        agentMode: "general",
        model: "gpt-5.2",
      });

      const chunks: Array<{ type?: string; runStatus?: string; conversationTitle?: string }> = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
        if (chunk.type === "run_end") break;
      }

      const titleIndex = chunks.findIndex((chunk) => chunk.type === "conversation_title");
      const runEndIndex = chunks.findIndex((chunk) => chunk.type === "run_end");
      expect(titleIndex).toBeGreaterThanOrEqual(0);
      expect(titleIndex).toBeLessThan(runEndIndex);
      expect(chunks[titleIndex]).toMatchObject({
        conversationTitle: "Fallback",
      });
      expect(chunks[runEndIndex]).toMatchObject({
        runStatus: "completed",
      });
      expect(mocks.after).toHaveBeenCalledTimes(3);
      expect(titleSpy).toHaveBeenCalledTimes(1);
      expect(mocks.endRun).toHaveBeenCalledWith("run-1", "completed", expect.any(Number), expect.any(Number));
    } finally {
      titleSpy.mockRestore();
    }
  });

  it("bounds title provider work and passes an aborting signal to an uncooperative provider", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    mocks.provider.chat.mockImplementationOnce(async (_messages, options) => {
      providerSignal = options?.signal;
      return new Promise(() => {});
    });
    const service = new AIService();
    const generateTitle = (
      service as unknown as {
        maybeGenerateConversationTitle: (params: {
          conversationId: string;
          projectId: string;
          historicalAssistantCount: number;
          firstUserMessage: string;
          assistantMessage: string;
          fallbackTitle: string;
        }) => Promise<string | null>;
      }
    ).maybeGenerateConversationTitle({
      conversationId: "conv-1",
      projectId: "project-1",
      historicalAssistantCount: 0,
      firstUserMessage: "How does exercise affect blood pressure?",
      assistantMessage: "Regular exercise generally lowers blood pressure.",
      fallbackTitle: "How does exercise affect blood pressure?",
    });

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(generateTitle).resolves.toBeNull();
    expect(providerSignal).toBeDefined();
    expect(providerSignal?.aborted).toBe(true);
    expect(mocks.aiConversationUpdateMany).not.toHaveBeenCalled();
  });

  it("refines only the deterministic title that this run claimed", async () => {
    mocks.provider.chat.mockResolvedValueOnce({
      id: "title-response",
      content: "Exercise Effects on Blood Pressure",
      model: "grok-4-1-fast",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    mocks.aiConversationUpdateMany.mockResolvedValueOnce({ count: 1 });
    const service = new AIService();
    const refinedTitle = await (
      service as unknown as {
        maybeGenerateConversationTitle: (params: {
          conversationId: string;
          projectId: string;
          historicalAssistantCount: number;
          firstUserMessage: string;
          assistantMessage: string;
          fallbackTitle: string;
        }) => Promise<string | null>;
      }
    ).maybeGenerateConversationTitle({
      conversationId: "conv-1",
      projectId: "project-1",
      historicalAssistantCount: 0,
      firstUserMessage: "How does exercise affect blood pressure?",
      assistantMessage: "Regular exercise generally lowers blood pressure.",
      fallbackTitle: "How does exercise affect blood pressure?",
    });

    expect(refinedTitle).toBe("Exercise Effects on Blood Pressure");
    expect(mocks.aiConversationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "conv-1",
        title: "How does exercise affect blood pressure?",
      },
      data: { title: "Exercise Effects on Blood Pressure" },
    });
  });

  it("does not retro-fail a completed run when trace flushing throws after finalization", async () => {
    mocks.flushTracing.mockRejectedValueOnce(new Error("trace flush failed"));

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; runStatus?: string; stopReason?: string }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunk.type === "run_end") break;
    }

    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "completed",
      stopReason: "natural",
    });
    expect(mocks.trace.end).toHaveBeenCalledTimes(1);
    expect(mocks.endRun).toHaveBeenCalledWith("run-1", "completed", expect.any(Number), expect.any(Number));
    expect(mocks.markRunFinalizationFailed).not.toHaveBeenCalled();
  });

  it("still emits completed run_end when usage settlement is deferred", async () => {
    mocks.trySettleUsageReservation.mockResolvedValue(false);

    const service = new AIService();
    const chunks: Array<{ type?: string; runStatus?: string; stopReason?: string }> = [];
    for await (const chunk of service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    })) {
      chunks.push(chunk);
    }

    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "completed",
      stopReason: "natural",
    });
    expect(mocks.endRun).toHaveBeenCalledWith(
      "run-1",
      "completed",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("preserves an observed generation receipt when a later tool execution fails", async () => {
    mocks.getContextualToolDefinitions.mockReturnValueOnce([{
      name: "search_pubmed",
      description: "Search",
      parameters: { type: "object", properties: {} },
    }]);
    mocks.provider.streamChat.mockImplementationOnce(async function* () {
      yield {
        type: "tool_call",
        toolCall: { id: "tool-1", name: "search_pubmed", arguments: {} },
      };
      yield {
        type: "done",
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
        actualModel: "provider-model-actual",
        actualProvider: "provider-host-actual",
        actualReasoningEffort: "high",
        actualDeliveryMode: "priority",
      };
    });
    mocks.executeToolWithAutonomy.mockImplementationOnce(async function* () {
      throw new Error("tool execution failed");
    });

    const service = new AIService();
    const chunks: Array<Record<string, unknown>> = [];
    for await (const chunk of service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    })) {
      chunks.push(chunk);
    }

    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "failed",
      actualModel: "provider-model-actual",
      actualModelSource: "provider",
      actualProvider: "provider-host-actual",
      actualReasoningEffort: "high",
      actualDeliveryMode: "priority",
    });
  });

  it("[runtime-cancelled-terminal-truth] does not persist partial assistant content after a durable semantic cancellation", async () => {
    const semanticCancellation = new AbortController();
    mocks.registerActiveRunExecutionCancellation.mockReturnValueOnce({
      signal: semanticCancellation.signal,
      abort: () => semanticCancellation.abort(),
      dispose: mocks.runCancellationDispose,
    });
    mocks.provider.streamChat.mockImplementationOnce(async function* () {
      yield {
        type: "done",
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
        actualModel: "provider-model-actual",
        actualProvider: "provider-host-actual",
        actualReasoningEffort: "high",
        actualDeliveryMode: "priority",
      };
      yield { type: "content", content: "partial answer" };
      semanticCancellation.abort();
      throw new DOMException("cancelled", "AbortError");
    });

    const service = new AIService();
    const chunks: Array<{ type?: string; runStatus?: string }> = [];
    for await (const chunk of service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    })) {
      chunks.push(chunk);
    }

    expect(mocks.addAssistantMessageToConversationForRun).not.toHaveBeenCalled();
    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "cancelled",
      actualModel: "provider-model-actual",
      actualModelSource: "provider",
      actualProvider: "provider-host-actual",
      actualReasoningEffort: "high",
      actualDeliveryMode: "priority",
    });
  });

  it("aborts a hung parent provider call at the hard wall-time budget", async () => {
    vi.useFakeTimers();
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    mocks.provider.streamChat.mockImplementationOnce(async function* (...args: unknown[]) {
      const options = args[1] as { signal?: AbortSignal } | undefined;
      markProviderStarted();
      await new Promise<never>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("deadline", "AbortError"));
        }, { once: true });
      });
    });

    const service = new AIService();
    const chunks: Array<{ type?: string; errorCode?: string; runStatus?: string; stopReason?: string }> = [];
    const collecting = (async () => {
      for await (const chunk of service.streamChatWithArtifacts("hello", "project", {
        projectId: "project-1",
        userId: "user-1",
        agentMode: "general",
        model: "gpt-5.2",
      })) {
        chunks.push(chunk);
      }
    })();

    await providerStarted;
    expect(mocks.provider.streamChat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    await collecting;

    expect(chunks.find((chunk) => chunk.type === "error")).toMatchObject({
      errorCode: "AGENT_LOOP_WALL_TIME_EXCEEDED",
    });
    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "failed",
      stopReason: "wall_time",
    });
  });

  it("suppresses stale assistant writes after ownership loss instead of finalizing the replaced run", async () => {
    const ownershipError = Object.assign(new Error("run no longer writable"), {
      runId: "run-1",
      status: "cancelled",
      finalizationState: "completed",
    });
    mocks.addAssistantMessageToConversationForRun.mockRejectedValueOnce(ownershipError);
    mocks.isRunOwnershipError.mockReturnValueOnce(true);
    mocks.markRunFinalizationState.mockResolvedValueOnce(0);

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });

    const chunks: Array<{ type?: string; runStatus?: string }> = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.find((chunk) => chunk.type === "run_end")).toMatchObject({
      runStatus: "cancelled",
    });
    expect(mocks.endRun).not.toHaveBeenCalled();
    expect(mocks.markRunFinalizationFailed).not.toHaveBeenCalled();
  });

  it("marks finalization as failed when endRun throws during forced cleanup", async () => {
    mocks.endRun.mockRejectedValueOnce(new Error("finalization write failed"));

    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "general",
      model: "gpt-5.2",
    });
    const iterator = stream[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.value?.type).toBe("run_start");

    await expect(iterator.return?.(undefined)).resolves.toEqual({ value: undefined, done: true });
    expect(mocks.markRunFinalizationState).toHaveBeenCalledWith("run-1", "in_progress");
    expect(mocks.markRunFinalizationFailed).toHaveBeenCalledWith("run-1");
  });
});
