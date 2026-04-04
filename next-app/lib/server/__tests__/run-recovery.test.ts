import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentRunFindFirst: vi.fn(),
  runEventFindMany: vi.fn(),
  runEventFindFirst: vi.fn(),
  artifactFindMany: vi.fn(),
  resolveLatestValidRunCheckpoint: vi.fn(),
  resolveDurableContinuationSource: vi.fn(),
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
    artifact: {
      findMany: mocks.artifactFindMany,
    },
  },
}));

vi.mock("@/lib/server/agent/durable-continuation", () => ({
  resolveDurableContinuationSource: mocks.resolveDurableContinuationSource,
}));

vi.mock("@/lib/server/agent/run-checkpoints", () => ({
  resolveLatestValidRunCheckpoint: mocks.resolveLatestValidRunCheckpoint,
}));

const { buildRunRecoveryResponse, REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES } = await import("@/lib/server/agent/run-recovery");

describe("run recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLatestValidRunCheckpoint.mockResolvedValue(null);
    mocks.resolveDurableContinuationSource.mockResolvedValue(null);
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

  it("replays the audited recovery-authoritative event set after the requested sequence", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-1",
      conversationId: "conv-1",
      status: "completed",
      runPhase: "finalize",
      phaseEnteredAt: new Date("2026-03-11T11:00:00.000Z"),
      model: "gpt-5.2",
      costTokensIn: 12,
      costTokensOut: 34,
      lastActivityAt: new Date("2026-03-11T11:00:00.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:00:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "completed",
      abnormalEndClassification: null,
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
        artifactId: null,
        messageRole: null,
      },
      {
        sequence: 5,
        type: "user_input_required",
        payload: {
          callId: "ask-1",
          question: "Which study should I inspect first?",
          questionType: "single_choice",
        },
        toolName: null,
        artifactId: null,
        messageRole: null,
      },
      {
        sequence: 6,
        type: "checkpoint",
        payload: { checkpointLabel: "PubMed found 18 total results. Reviewing the strongest matches now." },
        toolName: null,
        artifactId: null,
        messageRole: null,
      },
      {
        sequence: 7,
        type: "artifact_proposed",
        payload: { artifactId: "artifact-1" },
        toolName: null,
        artifactId: "artifact-1",
        messageRole: null,
      },
      {
        sequence: 8,
        type: "error",
        payload: {
          error: "The active run is still holding this conversation. Choose how to continue.",
          errorMeta: {
            kind: "run_conflict",
            code: "ACTIVE_RUN_EXISTS",
            retryable: false,
            source: "conversation_run_lock",
            message: "The active run is still holding this conversation. Choose how to continue.",
            runId: "run-1",
            activeRunId: "run-1",
            recoveryRecommendation: "stop_and_retry",
          },
        },
        toolName: null,
        artifactId: null,
        messageRole: null,
      },
      {
        sequence: 9,
        type: "message",
        payload: { content: "user echo" },
        toolName: null,
        artifactId: null,
        messageRole: "user",
      },
    ]);
    mocks.runEventFindFirst.mockResolvedValue({ sequence: 9 });
    mocks.artifactFindMany.mockResolvedValue([
      {
        id: "artifact-1",
        type: "plan",
        status: "proposed",
        title: "Scoping complete",
        payload: { steps: [{ id: "step-1" }] },
        version: 3,
      },
    ]);

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-1",
      afterSequence: 2,
    });

    expect(REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES).toEqual([
      "message",
      "tool_call",
      "tool_result",
      "user_input_required",
      "user_input_resolved",
      "artifact_proposed",
      "artifact_reviewed",
      "checkpoint",
      "error",
    ]);
    expect(mocks.runEventFindMany).toHaveBeenCalledWith({
      where: {
        runId: "run-1",
        sequence: { gt: 2 },
        type: {
          in: [
            "message",
            "tool_call",
            "tool_result",
            "user_input_required",
            "user_input_resolved",
            "artifact_proposed",
            "artifact_reviewed",
            "checkpoint",
            "error",
          ],
        },
      },
      orderBy: { sequence: "asc" },
      select: {
        sequence: true,
        type: true,
        payload: true,
        toolName: true,
        artifactId: true,
        messageRole: true,
      },
    });
    expect(mocks.artifactFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["artifact-1"] } },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        payload: true,
        version: true,
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
      {
        sequence: 5,
        chunk: {
          type: "user_input_required",
          userInputRequest: {
            callId: "ask-1",
            questionId: "ask-1:question-1",
            question: "Which study should I inspect first?",
            questionType: "single_choice",
          },
          replay: true,
          conversationId: "conv-1",
        },
      },
      {
        sequence: 6,
        chunk: {
          type: "checkpoint",
          checkpointLabel: "PubMed found 18 total results. Reviewing the strongest matches now.",
          replay: true,
          conversationId: "conv-1",
        },
      },
      {
        sequence: 7,
        chunk: {
          type: "artifact",
          artifactId: "artifact-1",
          artifactType: "plan",
          artifactStatus: "proposed",
          artifactTitle: "Scoping complete",
          artifactPayload: { steps: [{ id: "step-1" }] },
          artifactVersion: 3,
          replay: true,
          conversationId: "conv-1",
        },
      },
      {
        sequence: 8,
        chunk: {
          type: "error",
          error: "The active run is still holding this conversation. Choose how to continue.",
          errorStatus: undefined,
          errorMeta: {
            kind: "run_conflict",
            code: "ACTIVE_RUN_EXISTS",
            retryable: false,
            source: "conversation_run_lock",
            message: "The active run is still holding this conversation. Choose how to continue.",
            runId: "run-1",
            activeRunId: "run-1",
            recoveryRecommendation: "stop_and_retry",
          },
          errorCode: "ACTIVE_RUN_EXISTS",
          errorHeaders: undefined,
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
    mocks.artifactFindMany.mockResolvedValue([]);

    mocks.agentRunFindFirst.mockResolvedValueOnce({
      id: "run-live",
      conversationId: "conv-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-03-11T11:59:20.000Z"),
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:59:30.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:59:30.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "not_started",
      abnormalEndClassification: null,
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
      runPhase: "act",
      phaseEnteredAt: new Date("2026-03-11T11:57:30.000Z"),
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:58:00.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:58:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "not_started",
      abnormalEndClassification: null,
    });

    const stale = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-stale",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });
    expect(stale.recoveryRecommendation).toBe("stop_and_retry");
  });

  it("synthesizes a paused terminal recovery path for running ask-phase runs with persisted input state", async () => {
    mocks.runEventFindMany.mockResolvedValue([
      {
        sequence: 4,
        type: "user_input_required",
        payload: {
          callId: "ask-1",
          question: "Choose a provider",
          questionType: "single_choice",
        },
        toolName: null,
        artifactId: null,
        messageRole: null,
      },
    ]);
    mocks.runEventFindFirst
      .mockResolvedValueOnce({ sequence: 4 })
      .mockResolvedValueOnce({ sequence: 4 });
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-ask",
      conversationId: "conv-1",
      status: "running",
      runPhase: "ask",
      phaseEnteredAt: new Date("2026-03-11T11:59:30.000Z"),
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:59:55.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:59:50.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "not_started",
      abnormalEndClassification: null,
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-ask",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });

    expect(result.runStatus).toBe("paused");
    expect(result.isActive).toBe(false);
    expect(result.recoveryRecommendation).toBe("terminal");
    expect(result.runPhase).toBe("ask");
    expect(result.phaseEnteredAt).toBe("2026-03-11T11:59:30.000Z");
    expect(result.terminalEvent).toEqual({
      chunk: {
        type: "run_end",
        runId: "run-ask",
        runStatus: "paused",
        runCostTokensIn: 0,
        runCostTokensOut: 0,
        actualModelSource: "unknown",
        conversationId: "conv-1",
        stopReason: "paused_for_input",
      },
    });
    expect(mocks.resolveLatestValidRunCheckpoint).not.toHaveBeenCalled();
    expect(mocks.resolveDurableContinuationSource).not.toHaveBeenCalled();
  });

  it("treats stale durable progress as no-forward-progress even when the heartbeat is fresh", async () => {
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-stalled",
      conversationId: "conv-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-03-11T11:58:30.000Z"),
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:59:50.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:58:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "not_started",
      abnormalEndClassification: null,
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-stalled",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });

    expect(result.recoveryRecommendation).toBe("stop_and_retry");
    expect(result.abnormalEndClassification).toBe("no_forward_durable_progress");
    expect(result.lastDurableProgressAt).toBe("2026-03-11T11:58:00.000Z");
    expect(result.durabilityState).toBe("durable");
    expect(result.finalizationState).toBe("not_started");
  });

  it("treats failed finalization as stop-and-retry instead of reconnect", async () => {
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-finalize-failed",
      conversationId: "conv-1",
      status: "running",
      runPhase: "finalize",
      phaseEnteredAt: new Date("2026-03-11T11:59:30.000Z"),
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:59:50.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:59:45.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "failed",
      abnormalEndClassification: "finalization_failed",
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-finalize-failed",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });

    expect(result.recoveryRecommendation).toBe("stop_and_retry");
    expect(result.abnormalEndClassification).toBe("finalization_failed");
    expect(result.durabilityState).toBe("durable");
    expect(result.finalizationState).toBe("failed");
  });

  it("surfaces degraded durability as stop-and-retry recovery truth", async () => {
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-degraded",
      conversationId: "conv-1",
      status: "running",
      runPhase: "verify",
      phaseEnteredAt: new Date("2026-03-11T11:59:30.000Z"),
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:59:55.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:59:50.000Z"),
      durabilityState: "degraded",
      durabilityDegradedReason: "tool_result_persistence_failed",
      finalizationState: "not_started",
      abnormalEndClassification: "recovery_required_persistence_failed",
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-degraded",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });

    expect(result.recoveryRecommendation).toBe("stop_and_retry");
    expect(result.abnormalEndClassification).toBe("recovery_required_persistence_failed");
    expect(result.durabilityState).toBe("degraded");
    expect(result.durabilityDegradedReason).toBe("tool_result_persistence_failed");
  });

  it("upgrades recovery to continue-from-durable-state only when a safe continuation source is proven", async () => {
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-continuable",
      conversationId: "conv-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-03-11T11:58:30.000Z"),
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:59:50.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:58:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "not_started",
      abnormalEndClassification: null,
    });
    mocks.resolveDurableContinuationSource.mockResolvedValue({
      kind: "tool_result",
      sourceRunId: "run-continuable",
      conversationId: "conv-1",
      eventSequence: 4,
      toolCallId: "call-1",
      toolName: "search_pubmed",
      toolResult: {
        callId: "call-1",
        result: { studies: [{ title: "Study A" }] },
      },
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-continuable",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });

    expect(mocks.resolveDurableContinuationSource).toHaveBeenCalledWith({
      runId: "run-continuable",
      conversationId: "conv-1",
    });
    expect(result.recoveryRecommendation).toBe("continue_from_durable_state");
    expect(result.abnormalEndClassification).toBe("no_forward_durable_progress");
  });

  it("prefers continue-from-checkpoint when a valid ready checkpoint exists", async () => {
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-checkpointed",
      conversationId: "conv-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-03-11T11:58:30.000Z"),
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:59:50.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:58:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "not_started",
      abnormalEndClassification: null,
    });
    mocks.resolveLatestValidRunCheckpoint.mockResolvedValue({
      checkpointId: "checkpoint-1",
      kind: "tool_result_ready",
      conversationId: "conv-1",
      nextStep: "reason_from_tool_result",
      sourceRunId: "run-checkpointed",
      sourceEventSequence: 6,
      toolCallId: "call-1",
      toolName: "search_pubmed",
      toolResult: {
        callId: "call-1",
        result: { studies: [{ title: "Study A" }] },
      },
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-checkpointed",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });

    expect(mocks.resolveLatestValidRunCheckpoint).toHaveBeenCalledWith({
      runId: "run-checkpointed",
      conversationId: "conv-1",
    });
    expect(mocks.resolveDurableContinuationSource).not.toHaveBeenCalled();
    expect(result.recoveryRecommendation).toBe("continue_from_checkpoint");
    expect(result.abnormalEndClassification).toBe("no_forward_durable_progress");
  });
});
