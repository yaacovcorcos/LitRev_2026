import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runCheckpointFindMany: vi.fn(),
  runCheckpointUpdateMany: vi.fn(),
  runEventFindFirst: vi.fn(),
  artifactFindFirst: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    runCheckpoint: {
      findMany: mocks.runCheckpointFindMany,
      updateMany: mocks.runCheckpointUpdateMany,
    },
    runEvent: {
      findFirst: mocks.runEventFindFirst,
    },
    artifact: {
      findFirst: mocks.artifactFindFirst,
    },
  },
}));

const {
  buildCheckpointContinuationContext,
  isCheckpointEligibleToolResult,
  resolveLatestValidRunCheckpoint,
} = await import("@/lib/server/agent/run-checkpoints");

describe("run checkpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runCheckpointFindMany.mockResolvedValue([]);
    mocks.runCheckpointUpdateMany.mockResolvedValue({ count: 0 });
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.artifactFindFirst.mockResolvedValue(null);
  });

  it("treats only successful non-blocked tool results as checkpoint-eligible", () => {
    expect(isCheckpointEligibleToolResult({
      toolName: "search_pubmed",
      toolResult: {
        callId: "call-1",
        result: { studies: [{ title: "Study A" }] },
      },
    })).toBe(true);

    expect(isCheckpointEligibleToolResult({
      toolName: "search_pubmed",
      toolResult: {
        callId: "call-1",
        result: null,
        requiresUserInput: true,
      },
    })).toBe(false);
  });

  it("resolves the latest valid tool-result checkpoint and ignores later same-run noise", async () => {
    mocks.runCheckpointFindMany.mockResolvedValue([
      {
        id: "checkpoint-2",
        runId: "run-1",
        conversationId: "conv-1",
        kind: "tool_result_ready",
        status: "ready",
        nextStep: "reason_from_tool_result",
        seedVersion: 1,
        seed: {
          sourceRunId: "run-1",
          sourceEventSequence: 6,
          toolCallId: "call-1",
          toolName: "search_pubmed",
          toolResult: {
            callId: "call-1",
            result: { studies: [{ title: "Study A" }] },
          },
        },
        sourceEventSequence: 6,
        sourceArtifactId: null,
        invalidatedReason: null,
      },
    ]);
    mocks.runEventFindFirst.mockResolvedValue({
      sequence: 6,
      type: "tool_result",
      payload: {
        callId: "call-1",
        result: { studies: [{ title: "Study A" }] },
      },
      toolName: "search_pubmed",
    });

    const result = await resolveLatestValidRunCheckpoint({
      runId: "run-1",
      conversationId: "conv-1",
    });

    expect(result).toEqual({
      checkpointId: "checkpoint-2",
      kind: "tool_result_ready",
      conversationId: "conv-1",
      nextStep: "reason_from_tool_result",
      sourceRunId: "run-1",
      sourceEventSequence: 6,
      toolCallId: "call-1",
      toolName: "search_pubmed",
      toolResult: {
        callId: "call-1",
        result: { studies: [{ title: "Study A" }] },
      },
    });
    expect(buildCheckpointContinuationContext(result!)).toContain("latest durable checkpoint");
  });

  it("invalidates artifact checkpoints only on authoritative source drift", async () => {
    mocks.runCheckpointFindMany.mockResolvedValue([
      {
        id: "checkpoint-3",
        runId: "run-2",
        conversationId: "conv-2",
        kind: "artifact_ready",
        status: "ready",
        nextStep: "reason_from_artifact_state",
        seedVersion: 1,
        seed: {
          sourceRunId: "run-2",
          sourceEventSequence: 8,
          artifactId: "artifact-1",
          artifactType: "protocol_suggestion",
          artifactStatus: "proposed",
          artifactTitle: "Protocol: outcome",
          artifactVersion: 2,
          artifactPayload: { field: "pico.outcome", value: ["mortality"] },
        },
        sourceEventSequence: 8,
        sourceArtifactId: "artifact-1",
        invalidatedReason: null,
      },
    ]);
    mocks.runEventFindFirst.mockResolvedValue({
      sequence: 8,
      artifactId: "artifact-1",
    });
    mocks.artifactFindFirst.mockResolvedValue({
      id: "artifact-1",
      type: "protocol_suggestion",
      status: "accepted",
      title: "Protocol: outcome",
      payload: { field: "pico.outcome", value: ["mortality"] },
      version: 3,
    });

    const result = await resolveLatestValidRunCheckpoint({
      runId: "run-2",
      conversationId: "conv-2",
    });

    expect(result).toBeNull();
    expect(mocks.runCheckpointUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "checkpoint-3",
        status: "ready",
      },
      data: {
        status: "invalidated",
        invalidatedReason: "source_artifact_drift",
      },
    });
  });
});
