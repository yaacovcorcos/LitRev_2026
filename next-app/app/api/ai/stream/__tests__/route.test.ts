import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  assertProjectAccess: vi.fn(),
  ingestChatUnificationMetric: vi.fn(),
  streamChatWithArtifacts: vi.fn(),
  streamChat: vi.fn(),
  resolveLatestValidRunCheckpoint: vi.fn(),
  buildCheckpointContinuationContext: vi.fn(),
  resolveDurableContinuationSource: vi.fn(),
  buildDurableContinuationContext: vi.fn(),
  resolvePendingUserInputSource: vi.fn(),
  persistUserInputResolution: vi.fn(),
  hydrateClarificationControllerState: vi.fn(),
  buildUserInputResolutionContinuationContext: vi.fn(),
  buildClarificationResolutionUserMessage: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: mocks.requireApiSession,
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: mocks.assertProjectAccess,
}));

vi.mock("@/lib/server/chat-unification-metrics", () => ({
  ingestChatUnificationMetric: mocks.ingestChatUnificationMetric,
}));

vi.mock("@/lib/server/actor", () => ({
  runWithActorContext: async (_context: unknown, fn: () => Promise<void>) => fn(),
}));

vi.mock("@/lib/server/ai", () => ({
  getAIService: () => ({
    streamChatWithArtifacts: mocks.streamChatWithArtifacts,
    streamChat: mocks.streamChat,
  }),
  AIService: class {
    streamChatWithTools() {
      return mocks.streamChatWithArtifacts();
    }
  },
}));

vi.mock("@/lib/server/agent/durable-continuation", () => ({
  resolveDurableContinuationSource: mocks.resolveDurableContinuationSource,
  buildDurableContinuationContext: mocks.buildDurableContinuationContext,
}));

vi.mock("@/lib/server/agent/run-checkpoints", () => ({
  resolveLatestValidRunCheckpoint: mocks.resolveLatestValidRunCheckpoint,
  buildCheckpointContinuationContext: mocks.buildCheckpointContinuationContext,
}));

vi.mock("@/lib/server/ai/clarification-controller", () => ({
  resolveDecisionBoundaryKey: ({ decisionBoundaryKey, question }: { decisionBoundaryKey?: string | null; question: string }) => (
    decisionBoundaryKey ?? question.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
  ),
  resolvePendingUserInputSource: mocks.resolvePendingUserInputSource,
  persistUserInputResolution: mocks.persistUserInputResolution,
  hydrateClarificationControllerState: mocks.hydrateClarificationControllerState,
  buildUserInputResolutionContinuationContext: mocks.buildUserInputResolutionContinuationContext,
  buildClarificationResolutionUserMessage: mocks.buildClarificationResolutionUserMessage,
}));

const { POST } = await import("../route");

describe("/api/ai/stream route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        workspaceId: "ws-1",
      },
    });
    mocks.assertProjectAccess.mockResolvedValue(undefined);
    mocks.ingestChatUnificationMetric.mockResolvedValue(undefined);
    mocks.resolveLatestValidRunCheckpoint.mockResolvedValue(null);
    mocks.resolveDurableContinuationSource.mockResolvedValue(null);
    mocks.buildCheckpointContinuationContext.mockReturnValue("[CONTINUATION_CONTEXT]\nPersisted checkpoint");
    mocks.buildDurableContinuationContext.mockReturnValue("[CONTINUATION_CONTEXT]\nPersisted tool result");
    mocks.resolvePendingUserInputSource.mockResolvedValue({
      sourceRunId: "run-paused",
      conversationId: "conv-1",
      requiredSequence: 4,
      request: {
        sourceRunId: "run-paused",
        callId: "ask-1",
        question: "Which direction should I take?",
        questionType: "single_choice",
        recommendedAnswer: "Use the broader evidence-first pass",
        decisionBoundaryKey: "scoping-direction",
      },
    });
    mocks.persistUserInputResolution.mockResolvedValue(undefined);
    mocks.hydrateClarificationControllerState.mockResolvedValue({
      totalClarificationCount: 1,
      hasDurableProgressSinceLastResolution: false,
      lastResolvedDecisionBoundaryKey: "scoping-direction",
    });
    mocks.buildUserInputResolutionContinuationContext.mockReturnValue("[CONTINUATION_CONTEXT]\nResolved clarification");
    mocks.buildClarificationResolutionUserMessage.mockImplementation(({ userMessage, resolution, request }) => (
      userMessage
      || resolution.answerText
      || request.recommendedAnswer
      || "resolved clarification"
    ));
  });

  it("streams checkpoint and user-input events without route-side persistence authorship", async () => {
    mocks.streamChatWithArtifacts.mockImplementation(async function* () {
      yield { type: "run_start", runId: "run-1", conversationId: "conv-1" };
      yield { type: "checkpoint", checkpointLabel: "PubMed found 18 total results. Reviewing the strongest matches now." };
      yield {
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-1",
          question: "Which study should I inspect first?",
          questionType: "single_choice",
        },
      };
      yield { type: "run_end", runId: "run-1", conversationId: "conv-1", runStatus: "paused", stopReason: "paused_for_input" };
    });

    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: "Find the best study and ask me which one to inspect",
        context: "global",
        options: {
          conversationId: "conv-1",
          agentMode: "general",
          page: "ai",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.text();
    const chunks = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "run_start",
      "checkpoint",
      "user_input_required",
      "run_end",
    ]);
  });

  it("emits an error chunk when the stream fails after run_start", async () => {
    mocks.streamChatWithArtifacts.mockImplementation(async function* () {
      yield { type: "run_start", runId: "run-1", conversationId: "conv-1" };
      throw new Error("simulated disconnect after run start");
    });

    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: "hello",
        context: "global",
        options: {
          conversationId: "conv-1",
          agentMode: "general",
          page: "ai",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.text();
    const chunks = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; error?: string });

    expect(chunks.map((chunk) => chunk.type)).toEqual(["run_start", "error"]);
    expect(chunks[1]?.error).toBe("simulated disconnect after run start");
  });

  it("prefers a valid checkpoint continuation source into stream runtime options", async () => {
    mocks.resolveLatestValidRunCheckpoint.mockResolvedValue({
      checkpointId: "checkpoint-1",
      kind: "tool_result_ready",
      conversationId: "conv-1",
      nextStep: "reason_from_tool_result",
      sourceRunId: "run-old",
      sourceEventSequence: 7,
      toolCallId: "call-1",
      toolName: "search_pubmed",
      toolResult: {
        callId: "call-1",
        result: { studies: [{ title: "Study A" }] },
      },
    });
    mocks.streamChatWithArtifacts.mockImplementation(async function* () {
      yield { type: "run_start", runId: "run-continued", conversationId: "conv-1" };
      yield { type: "run_end", runId: "run-continued", conversationId: "conv-1", runStatus: "completed", stopReason: null };
    });

    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: "Continue from the saved work",
        context: "global",
        options: {
          conversationId: "conv-1",
          continueFromRunId: "run-old",
          agentMode: "general",
          page: "ai",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.resolveLatestValidRunCheckpoint).toHaveBeenCalledWith({
      runId: "run-old",
      conversationId: "conv-1",
    });
    expect(mocks.buildCheckpointContinuationContext).toHaveBeenCalledTimes(1);
    expect(mocks.resolveDurableContinuationSource).not.toHaveBeenCalled();
    expect(mocks.streamChatWithArtifacts.mock.calls[0]?.[2]).toMatchObject({
      conversationId: "conv-1",
      continueFromRunId: "run-old",
      replaceRunId: "run-old",
      continuationContext: "[CONTINUATION_CONTEXT]\nPersisted checkpoint",
    });
  });

  it("falls back to a valid durable continuation source when no checkpoint exists", async () => {
    mocks.resolveDurableContinuationSource.mockResolvedValue({
      kind: "tool_result",
      sourceRunId: "run-old",
      conversationId: "conv-1",
      eventSequence: 5,
      toolCallId: "call-1",
      toolName: "search_pubmed",
      toolResult: {
        callId: "call-1",
        result: { studies: [{ title: "Study A" }] },
      },
    });
    mocks.streamChatWithArtifacts.mockImplementation(async function* () {
      yield { type: "run_start", runId: "run-continued", conversationId: "conv-1" };
      yield { type: "run_end", runId: "run-continued", conversationId: "conv-1", runStatus: "completed", stopReason: null };
    });

    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: "Continue from the saved work",
        context: "global",
        options: {
          conversationId: "conv-1",
          continueFromRunId: "run-old",
          agentMode: "general",
          page: "ai",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.resolveLatestValidRunCheckpoint).toHaveBeenCalledWith({
      runId: "run-old",
      conversationId: "conv-1",
    });
    expect(mocks.resolveDurableContinuationSource).toHaveBeenCalledWith({
      runId: "run-old",
      conversationId: "conv-1",
    });
    expect(mocks.buildDurableContinuationContext).toHaveBeenCalledTimes(1);
    expect(mocks.streamChatWithArtifacts).toHaveBeenCalledTimes(1);
    expect(mocks.streamChatWithArtifacts.mock.calls[0]?.[2]).toMatchObject({
      conversationId: "conv-1",
      continueFromRunId: "run-old",
      replaceRunId: "run-old",
      continuationContext: "[CONTINUATION_CONTEXT]\nPersisted tool result",
    });
  });

  it("emits a typed continuation-unavailable error chunk when the source is no longer valid", async () => {
    mocks.resolveLatestValidRunCheckpoint.mockResolvedValue(null);
    mocks.resolveDurableContinuationSource.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: "Continue from the saved work",
        context: "global",
        options: {
          conversationId: "conv-1",
          continueFromRunId: "run-old",
          agentMode: "general",
          page: "ai",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.streamChatWithArtifacts).not.toHaveBeenCalled();

    const body = await response.text();
    const chunks = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; errorCode?: string; errorMeta?: { recoveryRecommendation?: string } });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      type: "error",
      errorMeta: {
        code: "RUN_CONTINUATION_UNAVAILABLE",
        recoveryRecommendation: "retry",
      },
    });
  });

  it("persists and streams structured clarification resolution before continuing the blocked run", async () => {
    mocks.streamChatWithArtifacts.mockImplementation(async function* () {
      yield { type: "run_start", runId: "run-continued", conversationId: "conv-1" };
      yield { type: "run_end", runId: "run-continued", conversationId: "conv-1", runStatus: "completed", stopReason: null };
    });

    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: "global",
        options: {
          conversationId: "conv-1",
          continueFromRunId: "run-paused",
          agentMode: "general",
          page: "ai",
          persistUserMessage: false,
          userInputResolution: {
            sourceRunId: "run-paused",
            callId: "ask-1",
            resolution: "answered",
            answerText: "Broaden the search first.",
            answeredAt: "2026-03-24T10:00:00.000Z",
          },
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.text();
    const chunks = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; userInputResolution?: { callId: string; sourceRunId: string } });

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "user_input_resolved",
      "run_start",
      "run_end",
    ]);
    expect(chunks[0]?.userInputResolution).toMatchObject({
      callId: "ask-1",
      sourceRunId: "run-paused",
    });
    expect(mocks.persistUserInputResolution).toHaveBeenCalledWith({
      resolution: expect.objectContaining({
        sourceRunId: "run-paused",
        callId: "ask-1",
        resolution: "answered",
      }),
    });
    expect(mocks.resolveLatestValidRunCheckpoint).not.toHaveBeenCalled();
    expect(mocks.resolveDurableContinuationSource).not.toHaveBeenCalled();
    expect(mocks.streamChatWithArtifacts.mock.calls[0]?.[2]).toMatchObject({
      conversationId: "conv-1",
      continueFromRunId: "run-paused",
      replaceRunId: "run-paused",
      parentRunId: "run-paused",
      persistUserMessage: false,
      persistedUserMessageContent: undefined,
      continuationContext: "[CONTINUATION_CONTEXT]\nResolved clarification",
    });
    expect(mocks.streamChatWithArtifacts.mock.calls[0]?.[0]).toBe("Broaden the search first.");
    expect(mocks.ingestChatUnificationMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "ask_user_answer_submitted",
      }),
    );
    expect(mocks.ingestChatUnificationMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "ask_user_answer_resume_started",
      }),
    );
  });

  it("treats blocked-card cancel as a terminal structured dismissal", async () => {
    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: "global",
        options: {
          conversationId: "conv-1",
          continueFromRunId: "run-paused",
          agentMode: "general",
          page: "ai",
          persistUserMessage: false,
          userInputResolution: {
            sourceRunId: "run-paused",
            callId: "ask-1",
            resolution: "cancelled",
            answerText: "Cancelled by the user.",
            answeredAt: "2026-03-24T10:00:00.000Z",
          },
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.streamChatWithArtifacts).not.toHaveBeenCalled();
    expect(mocks.buildClarificationResolutionUserMessage).not.toHaveBeenCalled();

    const body = await response.text();
    const chunks = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; runStatus?: string; stopReason?: string });

    expect(chunks).toEqual([
      expect.objectContaining({ type: "user_input_resolved" }),
      expect.objectContaining({ type: "run_end", runStatus: "cancelled", stopReason: "cancelled" }),
    ]);
    expect(mocks.ingestChatUnificationMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "ask_user_cancelled",
      }),
    );
    expect(mocks.ingestChatUnificationMetric).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "ask_user_answer_resume_started",
      }),
    );
  });

  it("treats blocked freeform rewrite as cancel-and-new-run instead of a clarification continuation", async () => {
    mocks.streamChatWithArtifacts.mockImplementation(async function* () {
      yield { type: "run_start", runId: "run-fresh", conversationId: "conv-1" };
      yield { type: "run_end", runId: "run-fresh", conversationId: "conv-1", runStatus: "completed", stopReason: null };
    });

    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: "Actually, compare the broader evidence first.",
        context: "global",
        options: {
          conversationId: "conv-1",
          agentMode: "general",
          page: "ai",
          userInputResolution: {
            sourceRunId: "run-paused",
            callId: "ask-1",
            resolution: "cancelled",
            answerText: "Actually, compare the broader evidence first.",
            answeredAt: "2026-03-24T10:00:00.000Z",
          },
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await response.text();

    expect(mocks.buildClarificationResolutionUserMessage).not.toHaveBeenCalled();
    expect(mocks.buildUserInputResolutionContinuationContext).not.toHaveBeenCalled();
    expect(mocks.streamChatWithArtifacts).toHaveBeenCalledTimes(1);
    expect(mocks.streamChatWithArtifacts.mock.calls[0]?.[0]).toBe("Actually, compare the broader evidence first.");
    expect(mocks.streamChatWithArtifacts.mock.calls[0]?.[2]).toMatchObject({
      conversationId: "conv-1",
      continueFromRunId: undefined,
      replaceRunId: undefined,
      parentRunId: undefined,
      userInputResolution: undefined,
    });
    expect(mocks.ingestChatUnificationMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "ask_user_cancelled",
      }),
    );
    expect(mocks.ingestChatUnificationMetric).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "ask_user_answer_resume_started",
      }),
    );
  });

  it("emits unknown-call telemetry and an error chunk for stale structured clarification answers", async () => {
    mocks.resolvePendingUserInputSource.mockRejectedValueOnce(new Error("The pending clarification request is stale or no longer active."));

    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: "global",
        options: {
          conversationId: "conv-1",
          continueFromRunId: "run-paused",
          agentMode: "general",
          page: "ai",
          persistUserMessage: false,
          userInputResolution: {
            sourceRunId: "run-paused",
            callId: "ask-missing",
            resolution: "answered",
            answerText: "Use the broad search first.",
            answeredAt: "2026-03-24T10:00:00.000Z",
          },
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.text();
    const chunks = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; error?: string });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe("error");
    expect(mocks.ingestChatUnificationMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "ask_user_unknown_call_id",
      }),
    );
  });

  it("fails structured clarification resume when continueFromRunId mismatches the blocked source run", async () => {
    const request = new NextRequest("http://localhost/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: "global",
        options: {
          conversationId: "conv-1",
          continueFromRunId: "run-other",
          agentMode: "general",
          page: "ai",
          persistUserMessage: false,
          userInputResolution: {
            sourceRunId: "run-paused",
            callId: "ask-1",
            resolution: "answered",
            answerText: "Broaden the search first.",
            answeredAt: "2026-03-24T10:00:00.000Z",
          },
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.text();
    const chunks = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; error?: string });

    expect(chunks[0]?.type).toBe("error");
    expect(mocks.ingestChatUnificationMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "ask_user_answer_resume_failed",
      }),
    );
  });
});
