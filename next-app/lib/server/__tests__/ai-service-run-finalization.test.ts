import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    chat: vi.fn(async () => ({
      id: "resp-1",
      content: "provider content",
      model: "gpt-5.2",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    })),
    streamChat: vi.fn(async function* () {
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
    endRun: vi.fn(),
    startRunHeartbeat: vi.fn(() => ({ stop: vi.fn() })),
    markRunFinalizationState: vi.fn(),
    markRunFinalizationFailed: vi.fn(),
    markRunAbnormalEndClassification: vi.fn(),
    isRunOwnershipError: vi.fn(() => false),
    startRunTrace: vi.fn(() => trace),
    flushTracing: vi.fn(),
    addAssistantMessageToConversationForRun: vi.fn(async () => ({
      id: "msg-1",
      role: "assistant",
      content: "assistant content",
      createdAt: new Date("2026-03-11T12:00:00.000Z").toISOString(),
    })),
    autoSummarizeIfNeeded: vi.fn(async () => {}),
    resolveAuthenticatedIdentity: vi.fn(),
    trace,
    provider,
  };
});

vi.mock("@/lib/server/ai/providers", () => ({
  BaseAIProvider: class {},
  getOpenAIProvider: () => mocks.provider,
  getAnthropicProvider: () => ({ isConfigured: () => false }),
  getXAIProvider: () => ({ isConfigured: () => false }),
  getGoogleProvider: () => ({ isConfigured: () => false }),
}));

vi.mock("@/lib/server/ai/rate-limiter", () => ({
  validateRateLimits: vi.fn(async () => {}),
  recordUsage: vi.fn(async () => {}),
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
  markMemoriesUsedInAnswer: vi.fn(async () => {}),
}));

vi.mock("@/lib/ai/config", () => ({
  AI_CONFIG: { defaultProvider: "mock-provider", defaultModel: "gpt-5.2" },
  getProviderForModel: vi.fn(() => "mock-provider"),
  getContextBudget: vi.fn(() => 8000),
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
  endRun: mocks.endRun,
  startRunHeartbeat: mocks.startRunHeartbeat,
  markRunFinalizationState: mocks.markRunFinalizationState,
  markRunFinalizationFailed: mocks.markRunFinalizationFailed,
  markRunAbnormalEndClassification: mocks.markRunAbnormalEndClassification,
  isRunOwnershipError: mocks.isRunOwnershipError,
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
  evaluateToolPrerequisites: vi.fn(),
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
  getContextualToolDefinitions: vi.fn(() => []),
  shouldUseScopingBatchPlan: vi.fn(() => false),
  buildScopingSearchPackPlan: vi.fn(),
  finalizeScopingResponse: vi.fn(({ fullContent }: { fullContent: string }) => ({ content: fullContent, report: null })),
}));

vi.mock("@/lib/server/ai/tool-autonomy", () => ({
  executeToolWithAutonomy: vi.fn(),
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
    mocks.startRun.mockResolvedValue({ id: "run-1" });
    mocks.endRun.mockResolvedValue({ id: "run-1", status: "failed" });
    mocks.markRunFinalizationState.mockResolvedValue(1);
    mocks.markRunFinalizationFailed.mockResolvedValue(1);
    mocks.markRunAbnormalEndClassification.mockResolvedValue(1);
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
    expect(mocks.markRunAbnormalEndClassification).toHaveBeenCalledWith("run-1", "unknown");
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
