import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const trace = {
    update: vi.fn(),
    end: vi.fn(),
  };
  trace.update.mockImplementation(() => trace);

  return {
    ensureConversationRunAvailability: vi.fn(),
    getConversationWithSummary: vi.fn(),
    getConversationWithSummaryById: vi.fn(),
    preparePlanExecution: vi.fn(),
    markPlanExecutionRunning: vi.fn(),
    failPlanExecution: vi.fn(),
    startRun: vi.fn(),
    endRun: vi.fn(),
    startRunTrace: vi.fn(() => trace),
    flushTracing: vi.fn(),
    resolveAuthenticatedIdentity: vi.fn(),
    trace,
  };
});

vi.mock("@/lib/server/ai/providers", () => ({
  BaseAIProvider: class {},
  getOpenAIProvider: () => ({ isConfigured: () => false }),
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
  addMessageToConversation: vi.fn(),
  getConversationWithSummary: mocks.getConversationWithSummary,
  getConversationWithSummaryById: mocks.getConversationWithSummaryById,
  autoSummarizeIfNeeded: vi.fn(async () => {}),
}));

vi.mock("@/lib/server/memory", () => ({
  retrieveMemories: vi.fn(async () => []),
  formatMemoriesForContext: vi.fn(() => ""),
  markMemoriesUsedInAnswer: vi.fn(async () => {}),
}));

vi.mock("@/lib/ai/config", () => ({
  AI_CONFIG: { defaultProvider: "mock", defaultModel: "gpt-5.2" },
  getProviderForModel: vi.fn(() => null),
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

vi.mock("@/lib/ai/prompts/copilot-prompts", () => ({
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
  startLLMGeneration: vi.fn(),
  startContextSpan: vi.fn(() => ({ update: vi.fn(() => ({ end: vi.fn() })) })),
  flushTracing: mocks.flushTracing,
}));

vi.mock("@/lib/server/ai/choices-extractor", () => ({
  withChoicesExtraction: vi.fn(),
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
  classifyAIError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  })),
  toAIErrorEnvelope: vi.fn((_error: unknown, envelope: Record<string, unknown>) => envelope),
}));

vi.mock("@/lib/server/utils/retry", () => ({
  retryAsync: vi.fn(),
  sleep: vi.fn(),
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

describe("AIService run finalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it("finalizes a started run when the stream is closed after run_start", async () => {
    const service = new AIService();
    const stream = service.streamChatWithArtifacts("hello", { page: "project" } as never, {
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
    const stream = service.streamChatWithArtifacts("", { page: "project" } as never, {
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
});
