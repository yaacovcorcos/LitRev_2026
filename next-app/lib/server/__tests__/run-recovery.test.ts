import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RUN_RECOVERY_ABSOLUTE_TIMEOUT_MS,
  RUN_RECOVERY_INACTIVITY_TIMEOUT_MS,
} from "@/lib/ai/run-recovery-client";

const mocks = vi.hoisted(() => ({
  agentRunFindFirst: vi.fn(),
  agentRunUpdateMany: vi.fn(),
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
      updateMany: mocks.agentRunUpdateMany,
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

const {
  buildRunRecoveryResponse,
  REPLAY_AUTHORITATIVE_RUN_EVENT_TYPES,
  RUN_RECOVERY_ABANDONED_STALE_MS,
} = await import("@/lib/server/agent/run-recovery");

describe("run recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.resolveLatestValidRunCheckpoint.mockResolvedValue(null);
    mocks.resolveDurableContinuationSource.mockResolvedValue(null);
  });

  it("keeps the client recovery window beyond the server's stale-worker proof", () => {
    expect(RUN_RECOVERY_ABANDONED_STALE_MS).toBe(45_000);
    expect(RUN_RECOVERY_INACTIVITY_TIMEOUT_MS).toBeGreaterThan(RUN_RECOVERY_ABANDONED_STALE_MS);
    expect(RUN_RECOVERY_ABSOLUTE_TIMEOUT_MS).toBeGreaterThan(150_000);
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

  it("labels the requested model as requested when no provider-observed model was persisted", async () => {
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-requested-model",
      conversationId: "conv-1",
      status: "completed",
      runPhase: "finalize",
      phaseEnteredAt: new Date("2026-03-11T11:59:30.000Z"),
      model: "gpt-5.6-luna",
      actualModel: null,
      actualProvider: null,
      actualReasoningEffort: null,
      actualDeliveryMode: null,
      costTokensIn: 12,
      costTokensOut: 3,
      lastActivityAt: new Date("2026-03-11T12:00:00.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T12:00:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "completed",
      abnormalEndClassification: null,
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-requested-model",
    });

    expect(result.terminalEvent).toMatchObject({
      chunk: {
        type: "run_end",
        actualModel: "gpt-5.6-luna",
        actualModelSource: "requested",
        actualProvider: undefined,
      },
    });
  });

  it("maps a stable gateway product ID to the same provider model ID used by live receipts", async () => {
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-requested-gateway-model",
      conversationId: "conv-1",
      status: "completed",
      runPhase: "finalize",
      phaseEnteredAt: new Date("2026-03-11T11:59:30.000Z"),
      model: "deepseek-v4-pro",
      actualModel: null,
      actualProvider: null,
      actualReasoningEffort: null,
      actualDeliveryMode: null,
      costTokensIn: 12,
      costTokensOut: 3,
      lastActivityAt: new Date("2026-03-11T12:00:00.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T12:00:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "completed",
      abnormalEndClassification: null,
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-requested-gateway-model",
    });

    expect(result.terminalEvent).toMatchObject({
      chunk: {
        type: "run_end",
        actualModel: "deepseek/deepseek-v4-pro",
        actualModelSource: "requested",
      },
    });
  });

  it("recommends reconnect for fresh running runs and terminalizes stale abandoned ones", async () => {
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
    mocks.agentRunUpdateMany.mockResolvedValueOnce({ count: 1 });

    const stale = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-stale",
      now: new Date("2026-03-11T12:00:00.000Z"),
      staleMs: 90_000,
    });
    expect(stale.recoveryRecommendation).toBe("terminal");
    expect(stale).toMatchObject({
      runStatus: "failed",
      isActive: false,
      abnormalEndClassification: "network_disconnect",
      terminalEvent: {
        chunk: {
          type: "run_end",
          runId: "run-stale",
          runStatus: "failed",
        },
      },
    });
    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "run-stale",
        conversationId: "conv-1",
        status: "running",
        completedAt: null,
        lastActivityAt: { lte: new Date("2026-03-11T11:58:30.000Z") },
      }),
      data: expect.objectContaining({
        status: "failed",
        runPhase: "finalize",
        phaseEnteredAt: new Date("2026-03-11T12:00:00.000Z"),
        finalizationState: "completed",
        abnormalEndClassification: "network_disconnect",
      }),
    }));
  });

  it("preserves the same durable continuation across repeated recovery requests", async () => {
    const runningRun = {
      id: "run-tool-abandoned",
      conversationId: "conv-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-07-13T09:00:00.000Z"),
      model: "grok-4.5",
      actualModel: "grok-4.5",
      actualProvider: "xai",
      actualReasoningEffort: "medium",
      actualDeliveryMode: "standard",
      costTokensIn: 12,
      costTokensOut: 34,
      lastActivityAt: new Date("2026-07-13T09:00:15.000Z"),
      lastDurableProgressAt: new Date("2026-07-13T09:00:14.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "not_started",
      abnormalEndClassification: null,
    };
    const recoveryTerminalizedRun = {
      ...runningRun,
      status: "failed",
      runPhase: "finalize",
      phaseEnteredAt: new Date("2026-07-13T09:01:01.000Z"),
      lastActivityAt: new Date("2026-07-13T09:01:01.000Z"),
      lastDurableProgressAt: new Date("2026-07-13T09:01:01.000Z"),
      finalizationState: "completed",
      abnormalEndClassification: "network_disconnect",
    };
    mocks.agentRunFindFirst
      .mockResolvedValueOnce(runningRun)
      .mockResolvedValueOnce(recoveryTerminalizedRun);
    mocks.runEventFindMany.mockResolvedValue([{
      sequence: 2,
      type: "tool_result",
      payload: {
        callId: "read-protocol-1",
        result: { success: true, data: { message: "No protocol is defined yet." } },
      },
      toolName: "read_protocol",
      artifactId: null,
      messageRole: null,
    }]);
    mocks.runEventFindFirst.mockResolvedValue({ sequence: 2 });
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.resolveDurableContinuationSource.mockResolvedValue({
      runId: "run-tool-abandoned",
      conversationId: "conv-1",
      eventSequence: 2,
      kind: "tool_result",
    });

    const firstResult = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-tool-abandoned",
      afterSequence: 1,
      now: new Date("2026-07-13T09:01:01.000Z"),
    });

    const secondResult = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-tool-abandoned",
      afterSequence: 1,
      now: new Date("2026-07-13T09:01:02.000Z"),
    });

    expect(firstResult.replayableEvents).toEqual([{
      sequence: 2,
      chunk: {
        type: "tool_result",
        toolResult: {
          callId: "read-protocol-1",
          result: { success: true, data: { message: "No protocol is defined yet." } },
        },
        toolName: "read_protocol",
        replay: true,
        conversationId: "conv-1",
      },
    }]);
    expect(firstResult).toMatchObject({
      runStatus: "failed",
      isActive: false,
      recoveryRecommendation: "continue_from_durable_state",
      terminalEvent: null,
    });
    expect(secondResult).toMatchObject({
      runStatus: "failed",
      isActive: false,
      recoveryRecommendation: "continue_from_durable_state",
      terminalEvent: null,
    });
    expect(mocks.agentRunUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.resolveDurableContinuationSource).toHaveBeenCalledTimes(2);
    expect(mocks.resolveDurableContinuationSource).toHaveBeenLastCalledWith({
      runId: "run-tool-abandoned",
      conversationId: "conv-1",
    });
  });

  it("does not widen ordinary failed runs into recovery continuations", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-ordinary-failure",
      conversationId: "conv-1",
      status: "failed",
      runPhase: "finalize",
      phaseEnteredAt: new Date("2026-07-13T09:01:00.000Z"),
      model: "grok-4.5",
      actualModel: "grok-4.5",
      actualProvider: "xai",
      actualReasoningEffort: "medium",
      actualDeliveryMode: "standard",
      costTokensIn: 12,
      costTokensOut: 1,
      lastActivityAt: new Date("2026-07-13T09:01:00.000Z"),
      lastDurableProgressAt: new Date("2026-07-13T09:01:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "completed",
      abnormalEndClassification: "unknown",
    });
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.resolveDurableContinuationSource.mockResolvedValue({
      kind: "tool_result",
      sourceRunId: "run-ordinary-failure",
      conversationId: "conv-1",
      eventSequence: 2,
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-ordinary-failure",
    });

    expect(mocks.resolveLatestValidRunCheckpoint).not.toHaveBeenCalled();
    expect(mocks.resolveDurableContinuationSource).not.toHaveBeenCalled();
    expect(result.recoveryRecommendation).toBe("terminal");
    expect(result.terminalEvent).toMatchObject({
      chunk: { type: "run_end", runStatus: "failed" },
    });
  });

  it("re-fetches final assistant events after stale reconciliation loses the ownership race", async () => {
    const staleRun = {
      id: "run-final-race",
      conversationId: "conv-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-07-13T09:00:00.000Z"),
      model: "grok-4.5",
      actualModel: "grok-4.5",
      actualProvider: "xai",
      actualReasoningEffort: "medium",
      actualDeliveryMode: "standard",
      costTokensIn: 20,
      costTokensOut: 10,
      lastActivityAt: new Date("2026-07-13T09:00:00.000Z"),
      lastDurableProgressAt: new Date("2026-07-13T09:00:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "not_started",
      abnormalEndClassification: null,
    };
    mocks.agentRunFindFirst
      .mockResolvedValueOnce(staleRun)
      .mockResolvedValueOnce({
        ...staleRun,
        status: "completed",
        runPhase: "finalize",
        phaseEnteredAt: new Date("2026-07-13T09:01:00.000Z"),
        lastActivityAt: new Date("2026-07-13T09:01:00.000Z"),
        lastDurableProgressAt: new Date("2026-07-13T09:01:00.000Z"),
        finalizationState: "completed",
      });
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.runEventFindMany.mockResolvedValue([{
      sequence: 3,
      type: "message",
      payload: { content: "The final answer committed during recovery." },
      toolName: null,
      artifactId: null,
      messageRole: "assistant",
    }]);
    mocks.runEventFindFirst.mockResolvedValue({ sequence: 3 });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-final-race",
      afterSequence: 2,
      now: new Date("2026-07-13T09:01:00.000Z"),
    });

    expect(mocks.agentRunFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.runEventFindMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.agentRunFindFirst.mock.invocationCallOrder[1]!,
    );
    expect(result.replayableEvents).toEqual([{
      sequence: 3,
      chunk: {
        type: "content",
        content: "The final answer committed during recovery.",
        contentMode: "replace",
        replay: true,
        conversationId: "conv-1",
      },
    }]);
    expect(result.lastSequence).toBe(3);
    expect(result.terminalEvent).toMatchObject({
      chunk: { type: "run_end", runStatus: "completed" },
    });
  });

  it("preserves a concurrent semantic cancellation that wins stale reconciliation", async () => {
    const staleRun = {
      id: "run-cancel-race",
      conversationId: "conv-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-07-13T09:00:00.000Z"),
      model: null,
      actualModel: null,
      actualProvider: null,
      actualReasoningEffort: null,
      actualDeliveryMode: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-07-13T09:00:00.000Z"),
      lastDurableProgressAt: new Date("2026-07-13T09:00:00.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "not_started",
      abnormalEndClassification: null,
    };
    mocks.agentRunFindFirst
      .mockResolvedValueOnce(staleRun)
      .mockResolvedValueOnce({
        ...staleRun,
        status: "cancelled",
        lastActivityAt: new Date("2026-07-13T09:01:00.000Z"),
        lastDurableProgressAt: new Date("2026-07-13T09:01:00.000Z"),
        finalizationState: "completed",
      });
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue(null);
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 0 });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-cancel-race",
      now: new Date("2026-07-13T09:01:00.000Z"),
    });

    expect(result).toMatchObject({
      runStatus: "cancelled",
      isActive: false,
      recoveryRecommendation: "terminal",
      terminalEvent: {
        chunk: {
          runStatus: "cancelled",
          stopReason: "cancelled",
        },
      },
    });
  });

  it("replays the live auto-applied artifact state from its authoritative review event", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-scoping",
      conversationId: "conv-scoping",
      status: "completed",
      runPhase: "finalize",
      phaseEnteredAt: new Date("2026-07-12T08:00:00.000Z"),
      model: "gpt-5.2",
      costTokensIn: 10,
      costTokensOut: 20,
      lastActivityAt: new Date("2026-07-12T08:00:01.000Z"),
      lastDurableProgressAt: new Date("2026-07-12T08:00:01.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "completed",
      abnormalEndClassification: null,
    });
    mocks.runEventFindMany.mockResolvedValue([
      {
        sequence: 4,
        type: "artifact_reviewed",
        payload: {
          artifactId: "artifact-scoping",
          status: "applied",
          type: "scoping_report",
        },
        toolName: null,
        artifactId: "artifact-scoping",
        messageRole: null,
      },
    ]);
    mocks.runEventFindFirst.mockResolvedValueOnce({ sequence: 4 });
    mocks.artifactFindMany.mockResolvedValue([
      {
        id: "artifact-scoping",
        type: "scoping_report",
        status: "auto_applied",
        title: "Scoping: Omega-3 and cognition",
        payload: { topic: "Omega-3 and cognition" },
        version: 1,
      },
    ]);

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-scoping",
      runId: "run-scoping",
    });

    expect(result.replayableEvents).toContainEqual({
      sequence: 4,
      chunk: {
        type: "artifact",
        artifactId: "artifact-scoping",
        artifactType: "scoping_report",
        artifactStatus: "auto_applied",
        artifactTitle: "Scoping: Omega-3 and cognition",
        artifactPayload: { topic: "Omega-3 and cognition" },
        artifactVersion: 1,
        replay: true,
        conversationId: "conv-scoping",
      },
    });
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
      .mockResolvedValueOnce(null)
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

  it("preserves cancelled stopReason in synthetic terminal recovery chunks", async () => {
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.runEventFindFirst.mockResolvedValue({ sequence: 3 });
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-cancelled",
      conversationId: "conv-1",
      status: "cancelled",
      runPhase: "finalize",
      phaseEnteredAt: new Date("2026-03-11T11:59:30.000Z"),
      model: null,
      costTokensIn: 0,
      costTokensOut: 0,
      lastActivityAt: new Date("2026-03-11T11:59:55.000Z"),
      lastDurableProgressAt: new Date("2026-03-11T11:59:50.000Z"),
      durabilityState: "durable",
      durabilityDegradedReason: null,
      finalizationState: "completed",
      abnormalEndClassification: null,
    });

    const result = await buildRunRecoveryResponse({
      conversationId: "conv-1",
      runId: "run-cancelled",
    });

    expect(result.terminalEvent).toEqual({
      chunk: {
        type: "run_end",
        runId: "run-cancelled",
        runStatus: "cancelled",
        runCostTokensIn: 0,
        runCostTokensOut: 0,
        actualModelSource: "unknown",
        conversationId: "conv-1",
        stopReason: "cancelled",
      },
    });
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
