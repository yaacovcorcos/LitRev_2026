import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectSearchReceiptObservations } from "@/lib/server/evals/runtime-signal-collector";
import { CORE_EVAL_SCENARIOS } from "@/lib/server/evals/scenario-catalog";

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
    chat: vi.fn(),
    streamChat: vi.fn(),
    isConfigured: vi.fn(() => true),
  };

  return {
    provider,
    trace,
    ensureConversationRunAvailability: vi.fn(),
    getConversationWithSummary: vi.fn(),
    getConversationWithSummaryById: vi.fn(),
    startRun: vi.fn(),
    getRun: vi.fn(),
    endRun: vi.fn(),
    markRunFinalizationState: vi.fn(),
    markRunFinalizationFailed: vi.fn(),
    markRunAbnormalEndClassification: vi.fn(),
    isRunOwnershipError: vi.fn(() => false),
    startRunHeartbeat: vi.fn(() => ({ stop: vi.fn() })),
    registerActiveRunExecutionCancellation: vi.fn(() => ({
      signal: new AbortController().signal,
      abort: vi.fn(),
      dispose: vi.fn(),
    })),
    startDurableRunCancellationMonitor: vi.fn(() => ({ stop: vi.fn() })),
    startRunTrace: vi.fn(() => trace),
    flushTracing: vi.fn(),
    resolveAuthenticatedIdentity: vi.fn(),
    executeTool: vi.fn(),
    executeToolWithAutonomy: vi.fn(),
    getToolDefinitions: vi.fn(),
    addAssistantMessageToConversationForRun: vi.fn(async () => ({
      id: "msg-1",
      role: "assistant",
      content: "assistant content",
      createdAt: new Date("2026-03-11T12:00:00.000Z").toISOString(),
    })),
    addMessageToConversation: vi.fn(),
    autoSummarizeIfNeeded: vi.fn(),
    retrieveMemories: vi.fn(),
    getAutonomyConfig: vi.fn(),
    protocolFindFirst: vi.fn(),
    emitEvent: vi.fn(),
    executeToolWithAutonomyCore: vi.fn(),
    evaluateToolPrerequisites: vi.fn(),
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
  autoSummarizeIfNeeded: mocks.autoSummarizeIfNeeded,
}));

vi.mock("@/lib/server/memory", () => ({
  retrieveMemories: mocks.retrieveMemories,
  formatMemoriesForContext: vi.fn(() => ""),
  markMemoriesUsedInAnswer: vi.fn(async () => {}),
}));

vi.mock("@/lib/ai/config", () => ({
  AI_CONFIG: { defaultProvider: "mock-provider", defaultModel: "gpt-5.2" },
  getProviderForModel: vi.fn(() => "mock-provider"),
  getContextBudget: vi.fn(() => 8000),
}));

vi.mock("@/lib/agent/compaction", () => ({
  buildModelVisibleToolResultForTool: vi.fn((_, value) => value),
  buildModelVisibleToolResult: vi.fn((value) => value),
  compactToolResult: vi.fn((_, value) => JSON.stringify(value)),
  compactLoopMessages: vi.fn((messages) => ({ messages, removed: 0 })),
  buildCompactedHistory: vi.fn((messages) => messages),
  estimateMessagesTokensWithSafetyMargin: vi.fn(() => 0),
  formatSummaryAsMessage: vi.fn(() => ""),
  repairConversationHistory: vi.fn((messages) => ({ messages })),
}));

vi.mock("@/lib/server/ai/tools", () => ({
  AVAILABLE_TOOLS: [],
  getToolDefinitions: mocks.getToolDefinitions,
  executeTool: mocks.executeTool,
}));

vi.mock("@/lib/server/agent/run", () => ({
  startRun: mocks.startRun,
  getRun: mocks.getRun,
  endRun: mocks.endRun,
  markRunFinalizationState: mocks.markRunFinalizationState,
  markRunFinalizationFailed: mocks.markRunFinalizationFailed,
  markRunAbnormalEndClassification: mocks.markRunAbnormalEndClassification,
  isRunOwnershipError: mocks.isRunOwnershipError,
  startRunHeartbeat: mocks.startRunHeartbeat,
}));

vi.mock("@/lib/server/agent/run-cancellation", () => ({
  registerActiveRunExecutionCancellation: mocks.registerActiveRunExecutionCancellation,
  startDurableRunCancellationMonitor: mocks.startDurableRunCancellationMonitor,
}));

vi.mock("@/lib/server/agent/events", () => ({
  emitEvent: mocks.emitEvent,
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
  createArtifact: vi.fn(),
}));

vi.mock("@/lib/server/agent/plan-execution", () => ({
  preparePlanExecution: vi.fn(async () => null),
  markPlanExecutionRunning: vi.fn(async () => undefined),
  failPlanExecution: vi.fn(async () => undefined),
  resolvePlanExecutionToolNames: vi.fn(() => ({
    allowedToolNames: ["search_pubmed"],
    unavailableToolNames: [],
  })),
  assertNextPlanToolCall: vi.fn(),
}));

vi.mock("@/lib/server/agent/autonomy", () => ({
  getAutonomyConfig: mocks.getAutonomyConfig,
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
  isDelegationEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/agent/loop-controller", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent/loop-controller")>("@/lib/agent/loop-controller");
  return {
    ...actual,
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

      recordToolCalls(toolCalls: unknown[]) {
        this.totalToolCalls += Array.isArray(toolCalls) ? toolCalls.length : 0;
        return false;
      }
    },
  };
});

vi.mock("@/lib/server/ai/tracing", () => ({
  startRunTrace: mocks.startRunTrace,
  startLLMGeneration: vi.fn(() => ({ update: vi.fn(), end: vi.fn() })),
  startContextSpan: vi.fn(() => ({ update: vi.fn(() => ({ end: vi.fn() })) })),
  startToolSpan: vi.fn(() => ({ update: vi.fn(() => ({ end: vi.fn() })), end: vi.fn() })),
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
    protocol: { findFirst: mocks.protocolFindFirst, findUnique: vi.fn(async () => null) },
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
    reason: "unknown",
  })),
  toAIErrorEnvelope: vi.fn((error: unknown, envelope: Record<string, unknown>) => ({
    ...envelope,
    message: error instanceof Error ? error.message : String(error),
  })),
}));

vi.mock("@/lib/server/utils/retry", () => ({
  retryAsync: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock("@/lib/ai/reasoning-visibility", () => ({
  resolveReasoningMode: vi.fn(() => "off"),
}));

vi.mock("@/lib/server/ai/tool-middleware", () => ({
  createIdempotencyMiddleware: vi.fn(() => (request: unknown) => request),
  executeWithToolMiddleware: vi.fn(async (request, _middlewares, handler) => handler(request)),
}));

vi.mock("@/lib/server/ai/tool-prerequisites", () => ({
  createToolPrerequisiteMiddleware: vi.fn(() => (request: unknown) => request),
  evaluateToolPrerequisites: mocks.evaluateToolPrerequisites,
}));

vi.mock("@/lib/server/auth/identity", () => ({
  resolveAuthenticatedIdentity: mocks.resolveAuthenticatedIdentity,
}));

vi.mock("@/lib/server/ledger-utils", () => ({
  computeLedgerCounts: vi.fn(async () => null),
  computeStudyLedger: vi.fn(async () => null),
}));

vi.mock("@/lib/server/ai/tool-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/ai/tool-helpers")>("@/lib/server/ai/tool-helpers");
  return {
    ...actual,
    getContextualToolDefinitions: vi.fn(() => mocks.getToolDefinitions()),
  };
});

vi.mock("@/lib/server/ai/tool-autonomy", () => ({
  executeToolWithAutonomy: mocks.executeToolWithAutonomy,
  executeToolWithAutonomyCore: mocks.executeToolWithAutonomyCore,
}));

const { AIService } = await import("@/lib/server/ai/ai-service");
const { executeSubAgent } = await import("@/lib/server/ai/sub-agent");

async function collectChunks<T extends { type?: string }>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
    if (chunk.type === "run_end") break;
  }
  return chunks;
}

describe("executable runtime search scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provider.chat.mockReset();
    mocks.provider.streamChat.mockReset();
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
    mocks.resolveAuthenticatedIdentity.mockReturnValue({ userId: "user-1", workspaceId: undefined });
    mocks.startRun.mockResolvedValue({ id: "run-1" });
    mocks.endRun.mockResolvedValue({ id: "run-1", status: "completed" });
    mocks.retrieveMemories.mockResolvedValue([]);
    mocks.getAutonomyConfig.mockResolvedValue({ preset: "assisted", toolOverrides: {} });
    mocks.protocolFindFirst.mockResolvedValue(null);
    mocks.getToolDefinitions.mockReturnValue([]);
    mocks.executeTool.mockReset();
    mocks.executeToolWithAutonomy.mockReset();
    mocks.executeToolWithAutonomyCore.mockReset();
    mocks.emitEvent.mockResolvedValue({ id: "evt-1" });
    mocks.evaluateToolPrerequisites.mockResolvedValue({ allowed: true });
  });

  it("executes the direct PubMed receipt scenario through the live chat runtime", async () => {
    const scenario = CORE_EVAL_SCENARIOS.find((candidate) => candidate.id === "search-direct-pubmed-receipt");
    expect(scenario?.expectedSignals).toContain("tool_activity:search_pubmed");

    mocks.provider.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc-pubmed",
            name: "search_pubmed",
            arguments: { query: "\"yoga\" AND hypertension AND randomized trial" },
          },
        };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "content", content: "I found a focused set of RCTs." };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      });

    mocks.executeToolWithAutonomy.mockImplementationOnce(async function* () {
      return {
        callId: "tc-pubmed",
        result: {
          query: "\"yoga\" AND hypertension AND randomized trial",
          source: "PubMed",
          totalResults: 42,
          returnedCount: 10,
          results: [{ pmid: "40123456", title: "Yoga trial" }],
        },
      };
    });

    const service = new AIService();
    const chunks = await collectChunks(service.streamChatWithArtifacts(scenario!.prompt, "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "search",
      model: "gpt-5.2",
    }));

    const receipts = collectSearchReceiptObservations(chunks, { page: "overview" });
    expect(receipts).toContainEqual(expect.objectContaining({
      toolName: "search_pubmed",
      status: "done",
      queryPreview: "\"yoga\" AND hypertension AND randomized trial",
      returnedCount: 10,
      totalResults: 42,
    }));
  });

  it("keeps attempted query provenance when a PubMed search fails", async () => {
    mocks.provider.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc-pubmed-fail",
            name: "search_pubmed",
            arguments: { query: "\"copd\" AND randomized trial" },
          },
        };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "content", content: "The search failed and needs a retry." };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      });

    mocks.executeToolWithAutonomy.mockImplementationOnce(async function* () {
      return {
        callId: "tc-pubmed-fail",
        result: null,
        error: "PubMed search failed",
      };
    });

    const service = new AIService();
    const chunks = await collectChunks(service.streamChatWithArtifacts("Retry the PubMed search", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "search",
      model: "gpt-5.2",
    }));

    const receipts = collectSearchReceiptObservations(chunks, { page: "overview" });
    expect(receipts).toContainEqual(expect.objectContaining({
      toolName: "search_pubmed",
      status: "failed",
      queryPreview: "\"copd\" AND randomized trial",
    }));
  });

  it("keeps zero-result searches as honest receipts", async () => {
    mocks.provider.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc-pubmed-zero",
            name: "search_pubmed",
            arguments: { query: "\"rare syndrome\" AND trial" },
          },
        };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "content", content: "No matching trials were found." };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      });

    mocks.executeToolWithAutonomy.mockImplementationOnce(async function* () {
      return {
        callId: "tc-pubmed-zero",
        result: {
          query: "\"rare syndrome\" AND trial",
          source: "PubMed",
          totalResults: 0,
          returnedCount: 0,
          results: [],
        },
      };
    });

    const service = new AIService();
    const chunks = await collectChunks(service.streamChatWithArtifacts("Search for a rare syndrome trial", "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "search",
      model: "gpt-5.2",
    }));

    const receipts = collectSearchReceiptObservations(chunks, { page: "overview" });
    expect(receipts).toContainEqual(expect.objectContaining({
      toolName: "search_pubmed",
      status: "done",
      queryPreview: "\"rare syndrome\" AND trial",
      returnedCount: 0,
      totalResults: 0,
    }));
  });

  it("executes a cross-provider OpenAlex search through the shared receipt path", async () => {
    const scenario = CORE_EVAL_SCENARIOS.find((candidate) => candidate.id === "search-direct-openalex-runtime");
    expect(scenario?.expectedSignals).toContain("tool_activity:search_openalex");

    mocks.provider.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc-openalex",
            name: "search_openalex",
            arguments: { query: "triage AI emergency department", maxResults: 5 },
          },
        };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "content", content: "I found a small cross-disciplinary set." };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      });

    mocks.executeToolWithAutonomy.mockImplementationOnce(async function* () {
      return {
        callId: "tc-openalex",
        result: {
          query: "triage AI emergency department",
          source: "OpenAlex",
          totalResults: 18,
          returnedCount: 5,
          results: [{ id: "W123", title: "AI triage" }],
        },
      };
    });

    const service = new AIService();
    const chunks = await collectChunks(service.streamChatWithArtifacts(scenario!.prompt, "project", {
      projectId: "project-1",
      userId: "user-1",
      agentMode: "search",
      model: "gpt-5.2",
    }));

    const receipts = collectSearchReceiptObservations(chunks, { page: "overview" });
    expect(receipts).toContainEqual(expect.objectContaining({
      toolName: "search_openalex",
      status: "done",
    }));
  });

  it("executes delegated search through the real child search runtime", async () => {
    const scenario = CORE_EVAL_SCENARIOS.find((candidate) => candidate.id === "search-delegated-pubmed-runtime");
    expect(scenario?.expectedSignals).toContain("tool_result:search_pubmed");

    mocks.getToolDefinitions.mockReturnValue([
      { name: "search_pubmed", description: "Search PubMed", parameters: {} },
    ]);
    mocks.provider.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc-child-pubmed",
            name: "search_pubmed",
            arguments: { query: "\"copd\" AND trial" },
          },
        };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "content", content: "The child run completed the search." };
        yield {
          type: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          actualModel: "gpt-5.2",
        };
      });

    mocks.executeToolWithAutonomyCore.mockImplementationOnce(async (params) => {
      await mocks.emitEvent(params.runId, "tool_result", { success: true }, { toolName: "search_pubmed" });
      return {
        callId: "tc-child-pubmed",
        result: {
          query: "\"copd\" AND trial",
          source: "PubMed",
          totalResults: 12,
          returnedCount: 5,
          results: [{ pmid: "39887711", title: "COPD trial" }],
        },
        error: undefined,
      };
    });

    const result = await executeSubAgent({
      mode: "search",
      task: scenario!.prompt,
      projectId: "project-1",
      userId: "user-1",
      parentRunId: "parent-run-1",
      conversationId: "conv-1",
      autonomyConfig: { preset: "assisted", toolOverrides: {} },
      model: "gpt-5.2",
    });

    expect(result.error).toBeUndefined();
    expect(result.totalToolCalls).toBe(1);
    expect(mocks.executeToolWithAutonomyCore).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          name: "search_pubmed",
        }),
      }),
    );
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      "run-1",
      "tool_result",
      expect.objectContaining({
        success: true,
      }),
      expect.objectContaining({
        toolName: "search_pubmed",
      }),
    );
  });
});
