import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveLatestValidRunCheckpoint: vi.fn(),
  buildCheckpointContinuationContext: vi.fn(),
  resolveDurableContinuationSource: vi.fn(),
  buildDurableContinuationContext: vi.fn(),
}));

vi.mock("@/lib/server/agent/run-checkpoints", () => ({
  resolveLatestValidRunCheckpoint: mocks.resolveLatestValidRunCheckpoint,
  buildCheckpointContinuationContext: mocks.buildCheckpointContinuationContext,
}));

vi.mock("@/lib/server/agent/durable-continuation", () => ({
  resolveDurableContinuationSource: mocks.resolveDurableContinuationSource,
  buildDurableContinuationContext: mocks.buildDurableContinuationContext,
}));

const { resolveRequestedContinuation } = await import("@/lib/server/agent/requested-continuation");

describe("requested continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLatestValidRunCheckpoint.mockResolvedValue(null);
    mocks.resolveDurableContinuationSource.mockResolvedValue(null);
    mocks.buildCheckpointContinuationContext.mockReturnValue("[CONTINUATION_CONTEXT]\ncheckpoint");
    mocks.buildDurableContinuationContext.mockReturnValue("[CONTINUATION_CONTEXT]\ndurable");
  });

  it("resolves strict continuation through the latest valid checkpoint when available", async () => {
    mocks.resolveLatestValidRunCheckpoint.mockResolvedValue({
      checkpointId: "checkpoint-1",
      kind: "tool_result_ready",
      conversationId: "conv-1",
      nextStep: "reason_from_tool_result",
      sourceRunId: "run-1",
      sourceEventSequence: 3,
      toolCallId: "call-1",
      toolName: "search_pubmed",
      toolResult: { callId: "call-1", result: { ok: true } },
    });

    await expect(resolveRequestedContinuation({
      conversationId: "conv-1",
      continueFromRunId: "run-1",
    })).resolves.toEqual({
      sourceRunId: "run-1",
      continuationContext: "[CONTINUATION_CONTEXT]\ncheckpoint",
      sourceKind: "checkpoint",
    });
    expect(mocks.resolveDurableContinuationSource).not.toHaveBeenCalled();
  });

  it("falls back to a durable source when no checkpoint exists", async () => {
    mocks.resolveDurableContinuationSource.mockResolvedValue({
      kind: "tool_result",
      sourceRunId: "run-2",
      conversationId: "conv-1",
      eventSequence: 5,
      toolCallId: "call-2",
      toolName: "search_pubmed",
      toolResult: { callId: "call-2", result: { ok: true } },
    });

    await expect(resolveRequestedContinuation({
      conversationId: "conv-1",
      continueFromRunId: "run-2",
    })).resolves.toEqual({
      sourceRunId: "run-2",
      continuationContext: "[CONTINUATION_CONTEXT]\ndurable",
      sourceKind: "durable",
    });
  });

  it("throws when strict continuation is requested but no safe source remains", async () => {
    await expect(resolveRequestedContinuation({
      conversationId: "conv-1",
      continueFromRunId: "run-3",
    })).rejects.toMatchObject({
      errorMeta: expect.objectContaining({
        code: "RUN_CONTINUATION_UNAVAILABLE",
        recoveryRecommendation: "retry",
      }),
    });
  });

  it("falls back cleanly for best-effort retry continuation when no source remains", async () => {
    await expect(resolveRequestedContinuation({
      conversationId: "conv-1",
      preferContinueFromRunId: "run-4",
    })).resolves.toEqual({
      sourceRunId: null,
    });
  });
});
