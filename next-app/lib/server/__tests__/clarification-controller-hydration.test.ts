import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentRunFindUnique: vi.fn(),
  agentRunFindMany: vi.fn(),
  runEventFindMany: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    agentRun: {
      findUnique: mocks.agentRunFindUnique,
      findMany: mocks.agentRunFindMany,
    },
    runEvent: {
      findMany: mocks.runEventFindMany,
    },
  },
}));

vi.mock("@/lib/server/agent/run-event-recorder", () => ({
  recordRunEvent: vi.fn(async () => ({ persisted: true, degraded: false })),
}));

const { hydrateClarificationControllerState } = await import("@/lib/server/ai/clarification-controller");

describe("clarification controller hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-1",
      conversationId: "conv-1",
      rootRunId: null,
    });
    mocks.agentRunFindMany.mockResolvedValue([{ id: "run-1" }]);
  });

  it("hydrates from the newest lineage window rather than the oldest scanned events", async () => {
    mocks.runEventFindMany.mockResolvedValue([
      {
        runId: "run-1",
        sequence: 205,
        type: "tool_result",
        payload: { callId: "tool-2", result: { ok: true } },
        toolName: "search_pubmed",
        createdAt: new Date("2026-04-16T12:05:00.000Z"),
      },
      {
        runId: "run-1",
        sequence: 204,
        type: "user_input_resolved",
        payload: {
          sourceRunId: "run-1",
          callId: "ask-2",
          decisionBoundaryKey: "latest-boundary",
          resolution: "answered",
        },
        toolName: null,
        createdAt: new Date("2026-04-16T12:04:00.000Z"),
      },
      {
        runId: "run-1",
        sequence: 103,
        type: "tool_result",
        payload: { callId: "tool-1", result: { ok: true } },
        toolName: "search_pubmed",
        createdAt: new Date("2026-04-16T11:03:00.000Z"),
      },
      {
        runId: "run-1",
        sequence: 102,
        type: "user_input_resolved",
        payload: {
          sourceRunId: "run-1",
          callId: "ask-1",
          decisionBoundaryKey: "older-boundary",
          resolution: "answered",
        },
        toolName: null,
        createdAt: new Date("2026-04-16T11:02:00.000Z"),
      },
      {
        runId: "run-1",
        sequence: 101,
        type: "user_input_required",
        payload: {
          callId: "ask-1",
          question: "Older question?",
          questionType: "yes_no",
        },
        toolName: null,
        createdAt: new Date("2026-04-16T11:01:00.000Z"),
      },
    ]);

    const result = await hydrateClarificationControllerState({
      sourceRunId: "run-1",
    });

    expect(mocks.runEventFindMany).toHaveBeenCalledWith({
      where: {
        runId: { in: ["run-1"] },
        type: {
          in: [
            "user_input_required",
            "user_input_resolved",
            "tool_result",
            "artifact_proposed",
            "artifact_reviewed",
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }, { sequence: "desc" }],
      take: 250,
      select: {
        runId: true,
        sequence: true,
        type: true,
        payload: true,
        toolName: true,
        createdAt: true,
      },
    });
    expect(result).toEqual({
      totalClarificationCount: 1,
      hasDurableProgressSinceLastResolution: true,
      lastResolvedDecisionBoundaryKey: "latest-boundary",
    });
  });
});
