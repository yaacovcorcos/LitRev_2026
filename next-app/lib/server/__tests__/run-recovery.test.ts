import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentRunFindFirst: vi.fn(),
  runEventFindMany: vi.fn(),
  runEventFindFirst: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    agentRun: {
      findFirst: mocks.agentRunFindFirst,
    },
    runEvent: {
      findMany: mocks.runEventFindMany,
      findFirst: mocks.runEventFindFirst,
    },
  },
}));

const { buildRunRecoveryResponse, REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES } = await import("@/lib/server/agent/run-recovery");

describe("run recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a safe retry response when the run is missing", async () => {
    mocks.agentRunFindFirst.mockResolvedValue(null);

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-missing",
    });

    expect(result).toMatchObject({
      conversationId: "conv-1",
      runId: "run-missing",
      runStatus: "missing",
      recoveryRecommendation: "retry",
      replayableEvents: [],
      terminalEvent: null,
    });
  });

  it("replays only assistant messages and tool receipts after the requested sequence", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-1",
      conversationId: "conv-1",
      status: "completed",
      model: "gpt-5.2",
      costTokensIn: 12,
      costTokensOut: 34,
      lastActivityAt: new Date("2026-03-11T11:00:00.000Z"),
    });
    mocks.runEventFindMany.mockResolvedValue([
      {
        sequence: 3,
        type: "message",
        payload: { content: "assistant answer" },
        toolName: null,
        messageRole: "assistant",
      },
      {
        sequence: 4,
        type: "tool_result",
        payload: { callId: "call-1", result: { ok: true } },
        toolName: "search_pubmed",
        messageRole: null,
      },
      {
        sequence: 5,
        type: "message",
        payload: { content: "user echo" },
        toolName: null,
        messageRole: "user",
      },
    ]);
    mocks.runEventFindFirst.mockResolvedValue({ sequence: 5 });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-1",
      afterSequence: 2,
    });

    expect(REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES).toEqual(["message", "tool_call", "tool_result"]);
    expect(mocks.runEventFindMany).toHaveBeenCalledWith({
      where: {
        runId: "run-1",
        sequence: { gt: 2 },
        type: { in: ["message", "tool_call", "tool_result"] },
      },
      orderBy: { sequence: "asc" },
      select: {
        sequence: true,
        type: true,
        payload: true,
        toolName: true,
        messageRole: true,
      },
    });
    expect(result.replayableEvents).toEqual([
      {
        sequence: 3,
        chunk: {
          type: "content",
          content: "assistant answer",
          contentMode: "replace",
          replay: true,
          conversationId: "conv-1",
        },
      },
      {
        sequence: 4,
        chunk: {
          type: "tool_result",
          toolResult: { callId: "call-1", result: { ok: true } },
          toolName: "search_pubmed",
          replay: true,
          conversationId: "conv-1",
        },
      },
    ]);
    expect(result.terminalEvent).toMatchObject({
      chunk: {
        type: "run_end",
        runId: "run-1",
        runStatus: "completed",
      },
    });
  });

  it("recommends reconnect for fresh running runs and stop-and-retry for stale ones", async () => {
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);

    mocks.agentRunFindFirst.mockResolvedValueOnce({
      id: "run-live",
      conversationId: "conv-1",
      status: "running",
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:59:30.000Z"),
    });

    const reconnect = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-live",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });
    expect(reconnect.recoveryRecommendation).toBe("reconnect");
    expect(reconnect.terminalEvent).toBeNull();

    mocks.agentRunFindFirst.mockResolvedValueOnce({
      id: "run-stale",
      conversationId: "conv-1",
      status: "running",
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:58:00.000Z"),
    });

    const stale = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-stale",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });
    expect(stale.recoveryRecommendation).toBe("stop_and_retry");
  });
});
