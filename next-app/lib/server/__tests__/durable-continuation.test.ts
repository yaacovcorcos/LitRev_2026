import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentRunFindFirst: vi.fn(),
  runEventFindMany: vi.fn(),
  artifactFindMany: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    agentRun: {
      findFirst: mocks.agentRunFindFirst,
    },
    runEvent: {
      findMany: mocks.runEventFindMany,
    },
    artifact: {
      findMany: mocks.artifactFindMany,
    },
  },
}));

const {
  buildDurableContinuationContext,
  resolveDurableContinuationSource,
} = await import("@/lib/server/agent/durable-continuation");

describe("durable continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a safe tool-result continuation source when only checkpoint/error events are newer", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-1",
      conversationId: "conv-1",
    });
    mocks.runEventFindMany.mockResolvedValue([
      {
        sequence: 7,
        type: "checkpoint",
        payload: { checkpointLabel: "Summarizing the saved search results." },
        toolName: null,
        artifactId: null,
        messageRole: null,
      },
      {
        sequence: 6,
        type: "error",
        payload: { error: "Connection lost while finishing the turn." },
        toolName: null,
        artifactId: null,
        messageRole: null,
      },
      {
        sequence: 5,
        type: "tool_result",
        payload: {
          callId: "call-1",
          result: { studies: [{ title: "Study A", pmid: "123" }] },
        },
        toolName: "search_pubmed",
        artifactId: null,
        messageRole: null,
      },
    ]);
    mocks.artifactFindMany.mockResolvedValue([]);

    const result = await resolveDurableContinuationSource({
      runId: "run-1",
      conversationId: "conv-1",
    });

    expect(result).toEqual({
      kind: "tool_result",
      sourceRunId: "run-1",
      conversationId: "conv-1",
      eventSequence: 5,
      toolCallId: "call-1",
      toolName: "search_pubmed",
      toolResult: {
        callId: "call-1",
        result: { studies: [{ title: "Study A", pmid: "123" }] },
      },
    });
    expect(buildDurableContinuationContext(result!)).toContain("search_pubmed");
  });

  it("resolves a safe artifact-state continuation source", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-2",
      conversationId: "conv-2",
    });
    mocks.runEventFindMany.mockResolvedValue([
      {
        sequence: 9,
        type: "artifact_proposed",
        payload: { artifactId: "artifact-1" },
        toolName: null,
        artifactId: "artifact-1",
        messageRole: null,
      },
    ]);
    mocks.artifactFindMany.mockResolvedValue([
      {
        id: "artifact-1",
        type: "protocol_suggestion",
        status: "proposed",
        title: "Protocol: outcomes",
        payload: { field: "pico.outcome", value: ["mortality"] },
        version: 2,
      },
    ]);

    const result = await resolveDurableContinuationSource({
      runId: "run-2",
      conversationId: "conv-2",
    });

    expect(result).toEqual({
      kind: "artifact_state",
      sourceRunId: "run-2",
      conversationId: "conv-2",
      eventSequence: 9,
      artifactId: "artifact-1",
      artifactType: "protocol_suggestion",
      artifactStatus: "proposed",
      artifactTitle: "Protocol: outcomes",
      artifactVersion: 2,
      artifactPayload: { field: "pico.outcome", value: ["mortality"] },
    });
  });

  it("refuses continuation when a later assistant message already exists", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-3",
      conversationId: "conv-3",
    });
    mocks.runEventFindMany.mockResolvedValue([
      {
        sequence: 11,
        type: "message",
        payload: { content: "Here is the saved answer." },
        toolName: null,
        artifactId: null,
        messageRole: "assistant",
      },
      {
        sequence: 10,
        type: "tool_result",
        payload: {
          callId: "call-2",
          result: { ok: true },
        },
        toolName: "search_pubmed",
        artifactId: null,
        messageRole: null,
      },
    ]);
    mocks.artifactFindMany.mockResolvedValue([]);

    const result = await resolveDurableContinuationSource({
      runId: "run-3",
      conversationId: "conv-3",
    });

    expect(result).toBeNull();
  });

  it("refuses continuation for blocked or user-input tool results", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-4",
      conversationId: "conv-4",
    });
    mocks.runEventFindMany.mockResolvedValue([
      {
        sequence: 4,
        type: "tool_result",
        payload: {
          callId: "call-3",
          result: null,
          requiresUserInput: true,
        },
        toolName: "search_pubmed",
        artifactId: null,
        messageRole: null,
      },
    ]);
    mocks.artifactFindMany.mockResolvedValue([]);

    const result = await resolveDurableContinuationSource({
      runId: "run-4",
      conversationId: "conv-4",
    });

    expect(result).toBeNull();
  });

  it("refuses continuation when a newer tool call means the next step depends on transient loop state", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-5",
      conversationId: "conv-5",
    });
    mocks.runEventFindMany.mockResolvedValue([
      {
        sequence: 12,
        type: "tool_call",
        payload: { callId: "call-4", args: { query: "follow-up" } },
        toolName: "search_pubmed",
        artifactId: null,
        messageRole: null,
      },
      {
        sequence: 11,
        type: "tool_result",
        payload: {
          callId: "call-3",
          result: { ok: true },
        },
        toolName: "search_pubmed",
        artifactId: null,
        messageRole: null,
      },
    ]);
    mocks.artifactFindMany.mockResolvedValue([]);

    const result = await resolveDurableContinuationSource({
      runId: "run-5",
      conversationId: "conv-5",
    });

    expect(result).toBeNull();
  });
});
