import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  assertProjectAccess: vi.fn(),
  ingestChatUnificationMetric: vi.fn(),
  streamChatWithArtifacts: vi.fn(),
  streamChat: vi.fn(),
  resolveDurableContinuationSource: vi.fn(),
  buildDurableContinuationContext: vi.fn(),
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
    mocks.resolveDurableContinuationSource.mockResolvedValue(null);
    mocks.buildDurableContinuationContext.mockReturnValue("[CONTINUATION_CONTEXT]\nPersisted tool result");
  });

  it("streams checkpoint and user-input events without route-side persistence authorship", async () => {
    mocks.streamChatWithArtifacts.mockImplementation(async function* () {
      yield { type: "run_start", runId: "run-1", conversationId: "conv-1" };
      yield { type: "checkpoint", checkpointLabel: "PubMed returned 18 results. Reviewing the strongest matches now." };
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

  it("resolves a valid continuation source into stream runtime options", async () => {
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
});
