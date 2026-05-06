import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const trace = {
    update: vi.fn(),
    end: vi.fn(),
  };
  trace.update.mockImplementation(() => trace);

  const generationSpan = {
    update: vi.fn(),
    end: vi.fn(),
  };

  const provider = {
    id: "openai",
    name: "OpenAI",
    streamChat: vi.fn(),
    isConfigured: vi.fn(() => true),
  };

  return {
    trace,
    generationSpan,
    provider,
    ensureConversationRunAvailability: vi.fn(),
    getConversationWithSummary: vi.fn(),
    getConversationWithSummaryById: vi.fn(),
    startRun: vi.fn(),
    getRun: vi.fn(),
    endRun: vi.fn(),
    startRunHeartbeat: vi.fn(() => ({ stop: vi.fn() })),
    registerActiveRunExecutionCancellation: vi.fn(() => ({
      signal: new AbortController().signal,
      abort: vi.fn(),
      dispose: vi.fn(),
    })),
    startDurableRunCancellationMonitor: vi.fn(() => ({ stop: vi.fn() })),
    markRunFinalizationState: vi.fn(),
    markRunFinalizationFailed: vi.fn(),
    markRunAbnormalEndClassification: vi.fn(),
    isRunOwnershipError: vi.fn(() => false),
    resolveAuthenticatedIdentity: vi.fn(),
    getAutonomyConfig: vi.fn(),
    protocolFindFirst: vi.fn(),
    executeToolWithAutonomy: vi.fn(),
    addAssistantMessageToConversationForRun: vi.fn(async () => ({
      id: "msg-1",
      role: "assistant",
      content: "assistant content",
      createdAt: new Date("2026-03-11T12:00:00.000Z").toISOString(),
    })),
    addMessageToConversation: vi.fn(),
    recordRunEvent: vi.fn(),
    persistRecoveryAuthoritativeRuntimeEvent: vi.fn(),
    ingestChatUnificationMetric: vi.fn(),
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
  addMessageToConversation: mocks.addMessageToConversation,
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
  AI_CONFIG: { defaultProvider: "openai", defaultModel: "gpt-5.2" },
  getProviderForModel: vi.fn(() => "openai"),
  getContextBudget: vi.fn(() => 8000),
}));

vi.mock("@/lib/agent/compaction", () => ({
  buildModelVisibleToolResultForTool: vi.fn((_toolName: string, toolResult: unknown) => toolResult),
  compactToolResult: vi.fn((_toolName: string, toolResult: unknown) => JSON.stringify(toolResult)),
  compactLoopMessages: vi.fn((messages) => ({ messages, removed: 0 })),
  buildCompactedHistory: vi.fn((messages) => messages),
  estimateMessagesTokensWithSafetyMargin: vi.fn(() => 0),
  formatSummaryAsMessage: vi.fn(() => ""),
  repairConversationHistory: vi.fn((messages) => ({ messages })),
}));

vi.mock("@/lib/server/ai/tools", () => ({
  AVAILABLE_TOOLS: [],
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
  isRunOwnershipError: mocks.isRunOwnershipError,
}));

vi.mock("@/lib/server/agent/run-cancellation", () => ({
  registerActiveRunExecutionCancellation: mocks.registerActiveRunExecutionCancellation,
  startDurableRunCancellationMonitor: mocks.startDurableRunCancellationMonitor,
}));

vi.mock("@/lib/server/agent/run-event-recorder", () => ({
  recordRunEvent: mocks.recordRunEvent,
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
  createArtifact: vi.fn(),
}));

vi.mock("@/lib/server/agent/autonomy", () => ({
  getAutonomyConfig: mocks.getAutonomyConfig,
}));

vi.mock("@/lib/server/agent/plan-payloads", () => ({
  buildExecutablePlanPayload: vi.fn((payload) => payload),
}));

vi.mock("@/lib/server/agent/plan-execution", () => ({
  assertNextPlanToolCall: vi.fn(),
  failPlanExecution: vi.fn(),
  markPlanExecutionRunning: vi.fn(),
  preparePlanExecution: vi.fn(async () => null),
  resolvePlanExecutionToolNames: vi.fn(),
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
  isScopingModeEnabled: vi.fn(() => true),
  isDelegationEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/agent/loop-controller", () => ({
  LoopState: class {
    iterations = 0;
    totalToolCalls = 0;
    stopReason: string | null = null;
    shouldContinue() {
      if (this.stopReason) {
        return { continue: false, stopReason: this.stopReason };
      }
      if (this.iterations < 3) {
        this.iterations += 1;
        return { continue: true, stopReason: "natural" };
      }
      return { continue: false, stopReason: this.stopReason ?? "natural" };
    }
    markStopped(reason: string) {
      this.stopReason = reason;
    }
    recordToolCalls(toolCalls: Array<{ repeatKey: string }>) {
      this.totalToolCalls += toolCalls.length;
      return false;
    }
  },
}));

vi.mock("@/lib/server/ai/tracing", () => ({
  startRunTrace: vi.fn(() => mocks.trace),
  startLLMGeneration: vi.fn(() => mocks.generationSpan),
  startContextSpan: vi.fn(() => ({ update: vi.fn(() => ({ end: vi.fn() })) })),
  flushTracing: vi.fn(async () => {}),
}));

vi.mock("@/lib/server/ai/choices-extractor", () => ({
  withChoicesExtraction: vi.fn((stream) => stream),
}));

vi.mock("@/lib/server/ai/title-generator", () => ({
  sanitizeGeneratedConversationTitle: vi.fn((value: string) => value),
  buildFallbackConversationTitle: vi.fn(() => "Fallback"),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    protocol: { findFirst: mocks.protocolFindFirst },
    aIConversation: {
      findUnique: vi.fn(async () => ({ title: null })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
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

vi.mock("@/lib/server/chat-runtime/persist-recovery-events", () => ({
  persistRecoveryAuthoritativeRuntimeEvent: mocks.persistRecoveryAuthoritativeRuntimeEvent,
}));

vi.mock("@/lib/server/chat-unification-metrics", () => ({
  ingestChatUnificationMetric: mocks.ingestChatUnificationMetric,
}));

vi.mock("@/lib/server/ai/error-classification", () => ({
  classifyAIError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
    reason: "unknown",
  })),
  toAIErrorEnvelope: vi.fn((_error: unknown, envelope: Record<string, unknown>) => envelope),
}));

vi.mock("@/lib/server/utils/retry", () => ({
  retryAsync: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  sleep: vi.fn(async () => {}),
}));

vi.mock("@/lib/ai/reasoning-visibility", () => ({
  resolveReasoningMode: vi.fn(() => "off"),
}));

vi.mock("@/lib/server/ai/tool-middleware", () => ({
  createIdempotencyMiddleware: vi.fn(() => ({})),
  executeWithToolMiddleware: vi.fn(),
}));

vi.mock("@/lib/server/ai/tool-prerequisites", () => ({
  createToolPrerequisiteMiddleware: vi.fn(() => ({})),
  evaluateToolPrerequisites: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/lib/server/auth/identity", () => ({
  resolveAuthenticatedIdentity: mocks.resolveAuthenticatedIdentity,
}));

vi.mock("@/lib/server/ledger-utils", () => ({
  computeLedgerCounts: vi.fn(async () => ({ total: 0, included: 0, excluded: 0, maybe: 0, unscreened: 0 })),
  computeStudyLedger: vi.fn(async () => ({
    counts: { total: 0, included: 0, excluded: 0, maybe: 0, unscreened: 0 },
    list: [],
    truncated: false,
    hasRecommendationSeeds: false,
  })),
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
  getContextualToolDefinitions: vi.fn(() => [
    { name: "search_pubmed", description: "", parameters: {} },
    { name: "ask_user", description: "", parameters: {} },
    { name: "store_memory", description: "", parameters: {} },
  ]),
  shouldShowScopingSearchPackPreview: vi.fn(() => false),
  shouldUseScopingBatchPlan: vi.fn(() => false),
  buildScopingSearchPackPlan: vi.fn(),
  finalizeScopingResponse: vi.fn(({ fullContent }: { fullContent: string }) => ({ content: fullContent, report: null })),
}));

vi.mock("@/lib/server/ai/tool-autonomy", () => ({
  executeToolWithAutonomy: mocks.executeToolWithAutonomy,
}));

const { AIService } = await import("@/lib/server/ai/ai-service");

async function collectChunks(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("AIService scoping runtime", () => {
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
    mocks.resolveAuthenticatedIdentity.mockReturnValue({ userId: "user-1", workspaceId: "ws-1" });
    mocks.startRun.mockResolvedValue({ id: "run-1" });
    mocks.endRun.mockResolvedValue({ id: "run-1", status: "completed" });
    mocks.markRunFinalizationState.mockResolvedValue(1);
    mocks.markRunFinalizationFailed.mockResolvedValue(1);
    mocks.markRunAbnormalEndClassification.mockResolvedValue(1);
    mocks.getAutonomyConfig.mockResolvedValue({ preset: "assisted", toolOverrides: {} });
    mocks.protocolFindFirst.mockResolvedValue(null);
  });

  it("suppresses ask_user after evidence arrives in the same scoping run", async () => {
    mocks.provider.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc-search",
            name: "search_pubmed",
            arguments: { query: "\"omega-3\" cognition young adults" },
          },
        };
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc-ask",
            name: "ask_user",
            arguments: {
              question: "Should I narrow to RCTs only?",
              questionType: "single_choice",
              options: [{ label: "Yes" }, { label: "No" }],
            },
          },
        };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "content", content: "Here is the broad evidence landscape and the strongest default direction." };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      });

    mocks.executeToolWithAutonomy
      .mockImplementationOnce(async function* () {
        return {
          callId: "tc-search",
          result: {
            totalResults: 17,
            returnedCount: 10,
          },
        };
      })
      .mockImplementationOnce(async function* () {
        return {
          callId: "tc-ask",
          result: { status: "waiting_for_user_input" },
          requiresUserInput: true,
          userInputRequest: {
            callId: "ask-1",
            question: "Should I narrow to RCTs only?",
            questionType: "single_choice",
            options: [{ label: "Yes" }, { label: "No" }],
          },
        };
      });

    const service = new AIService();
    const chunks = await collectChunks(service.streamChatWithArtifacts(
      "What's out there on omega-3 supplementation for cognition in young adults?",
      "project",
      {
        projectId: "project-1",
        userId: "user-1",
        agentMode: "scoping",
        model: "gpt-5.2",
      }
    ));
    expect(chunks.some((chunk) => (chunk as { type?: string }).type === "user_input_required")).toBe(false);
    expect(chunks.some((chunk) => (chunk as { type?: string }).type === "content")).toBe(true);
    expect(chunks.some((chunk) => (chunk as { type?: string; runStatus?: string }).type === "run_end" && (chunk as { runStatus?: string }).runStatus === "failed")).toBe(true);
    expect(mocks.markRunAbnormalEndClassification).toHaveBeenCalledWith("run-1", "no_forward_durable_progress", {
      requireActive: true,
    });
    expect(mocks.persistRecoveryAuthoritativeRuntimeEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: "user_input_required" }),
      })
    );
  });

  it("uses the recommended default instead of pausing when scoping policy blocks another clarification", async () => {
    mocks.provider.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc-search",
            name: "search_pubmed",
            arguments: { query: "\"omega-3\" cognition young adults" },
          },
        };
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc-ask",
            name: "ask_user",
            arguments: {
              question: "Should I narrow to RCTs only?",
              questionType: "single_choice",
              options: [{ label: "Yes" }, { label: "No" }],
              recommendedAnswer: "No, stay broad first.",
            },
          },
        };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "content", content: "I stayed broad first and synthesized the strongest direction." };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      });

    mocks.executeToolWithAutonomy
      .mockImplementationOnce(async function* () {
        return {
          callId: "tc-search",
          result: {
            totalResults: 17,
            returnedCount: 10,
          },
        };
      })
      .mockImplementationOnce(async function* () {
        return {
          callId: "tc-ask",
          result: { status: "waiting_for_user_input" },
          requiresUserInput: true,
          userInputRequest: {
            callId: "ask-1",
            question: "Should I narrow to RCTs only?",
            questionType: "single_choice",
            options: [{ label: "Yes" }, { label: "No" }],
            recommendedAnswer: "No, stay broad first.",
          },
        };
      });

    const service = new AIService();
    const chunks = await collectChunks(service.streamChatWithArtifacts(
      "What's out there on omega-3 supplementation for cognition in young adults?",
      "project",
      {
        projectId: "project-1",
        userId: "user-1",
        agentMode: "scoping",
        model: "gpt-5.2",
      }
    ));
    expect(chunks.some((chunk) => (chunk as { type?: string }).type === "user_input_required")).toBe(false);
    expect(chunks.some((chunk) => (chunk as { type?: string }).type === "content")).toBe(true);
  });

  it("records no_forward_durable_progress when clarification fallback ends in a truthful stop", async () => {
    mocks.provider.streamChat.mockImplementationOnce(async function* () {
      yield {
        type: "tool_call",
        toolCall: {
          id: "tc-search",
          name: "search_pubmed",
          arguments: { query: "\"omega-3\" cognition young adults" },
        },
      };
      yield {
        type: "tool_call",
        toolCall: {
          id: "tc-ask",
          name: "ask_user",
          arguments: {
            question: "Describe exactly how much uncertainty is acceptable before I proceed.",
            questionType: "free_text",
          },
        },
      };
      yield {
        type: "done",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        actualModel: "gpt-5.2",
      };
    });

    mocks.executeToolWithAutonomy
      .mockImplementationOnce(async function* () {
        return {
          callId: "tc-search",
          result: {
            totalResults: 17,
            returnedCount: 10,
          },
        };
      })
      .mockImplementationOnce(async function* () {
        return {
          callId: "tc-ask",
          result: { status: "waiting_for_user_input" },
          requiresUserInput: true,
          userInputRequest: {
            callId: "ask-2",
            question: "Describe exactly how much uncertainty is acceptable before I proceed.",
            questionType: "free_text",
          },
        };
      });

    const service = new AIService();
    const chunks = await collectChunks(service.streamChatWithArtifacts(
      "What's out there on omega-3 supplementation for cognition in young adults?",
      "project",
      {
        projectId: "project-1",
        userId: "user-1",
        agentMode: "scoping",
        model: "gpt-5.2",
      }
    ));
    expect(chunks.some((chunk) => (chunk as { type?: string }).type === "user_input_required")).toBe(false);
    expect(chunks.some((chunk) => (chunk as { type?: string }).type === "content")).toBe(true);
  });
});
