import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  getToolDefinitions: vi.fn(),
  evaluateToolPrerequisites: vi.fn(),
  executeToolWithAutonomyCore: vi.fn(),
  preRecordToolCallBatchForAutonomy: vi.fn(),
  assembleSystemPrompt: vi.fn(() => "SYSTEM"),
  startRun: vi.fn(),
  getRun: vi.fn(),
  endRun: vi.fn(),
  markRunFinalizationState: vi.fn(),
  markRunFinalizationFailed: vi.fn(),
  isRunOwnershipError: vi.fn(),
  isRunLineageToolBudgetExceededError: vi.fn(),
  heartbeatStop: vi.fn(),
  startRunHeartbeat: vi.fn(),
  recordRunEvent: vi.fn(),
  protocolFindUnique: vi.fn(),
}));

vi.mock("@/lib/server/ai/ai-service", () => ({
  getAIService: () => ({
    streamChat: mocks.streamChat,
  }),
}));

vi.mock("@/lib/server/ai/tools/base", () => ({
  getToolDefinitions: mocks.getToolDefinitions,
}));

vi.mock("@/lib/server/ai/tool-prerequisites", () => ({
  evaluateToolPrerequisites: mocks.evaluateToolPrerequisites,
}));

vi.mock("@/lib/server/ai/tool-autonomy", () => ({
  executeToolWithAutonomyCore: mocks.executeToolWithAutonomyCore,
  preRecordToolCallBatchForAutonomy: mocks.preRecordToolCallBatchForAutonomy,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    protocol: {
      findUnique: mocks.protocolFindUnique,
    },
  },
}));

vi.mock("@/lib/ai/prompts/assistant-prompts", () => ({
  assembleSystemPrompt: mocks.assembleSystemPrompt,
}));

vi.mock("@/lib/server/agent/run", () => ({
  startRun: mocks.startRun,
  getRun: mocks.getRun,
  endRun: mocks.endRun,
  markRunFinalizationState: mocks.markRunFinalizationState,
  markRunFinalizationFailed: mocks.markRunFinalizationFailed,
  isRunOwnershipError: mocks.isRunOwnershipError,
  startRunHeartbeat: mocks.startRunHeartbeat,
  recordRunGenerationReceipt: vi.fn(async () => {}),
}));

vi.mock("@/lib/server/agent/events", () => ({
  isRunLineageToolBudgetExceededError: mocks.isRunLineageToolBudgetExceededError,
}));

vi.mock("@/lib/server/agent/run-event-recorder", () => ({
  recordRunEvent: mocks.recordRunEvent,
}));

const { executeSubAgent } = await import("@/lib/server/ai/sub-agent");
const { DOOM_LOOP_THRESHOLD } = await import("@/lib/agent/loop-controller");

describe("executeSubAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToolDefinitions.mockReturnValue([
      { name: "update_protocol", description: "d", parameters: {} },
    ]);
    mocks.protocolFindUnique.mockReset();
    mocks.evaluateToolPrerequisites.mockResolvedValue({ allowed: true });
    mocks.preRecordToolCallBatchForAutonomy.mockResolvedValue(new Map());
    mocks.startRun.mockResolvedValue({ id: "sub-run-1" });
    mocks.getRun.mockResolvedValue(null);
    mocks.endRun.mockResolvedValue({ id: "sub-run-1" });
    mocks.markRunFinalizationState.mockResolvedValue(1);
    mocks.markRunFinalizationFailed.mockResolvedValue(1);
    mocks.isRunOwnershipError.mockReturnValue(false);
    mocks.isRunLineageToolBudgetExceededError.mockReturnValue(false);
    mocks.startRunHeartbeat.mockReturnValue({ stop: mocks.heartbeatStop });
    mocks.recordRunEvent.mockResolvedValue({ persisted: true, degraded: false });
  });

  it("keeps delegated proposal artifacts proposed instead of auto-applying them", async () => {
    mocks.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc1",
            name: "update_protocol",
            arguments: { field: "researchQuestion", value: "RQ", rationale: "user requested" },
          },
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "content", content: "Updated protocol." };
        yield { type: "done" };
      });

    mocks.executeToolWithAutonomyCore.mockResolvedValue({
      callId: "tc1",
      result: { field: "researchQuestion", value: "RQ", rationale: "user requested" },
      artifactId: "artifact-1",
      artifactType: "protocol_suggestion",
      artifactTitle: "Protocol: researchQuestion",
      artifactStatus: "proposed",
      artifacts: [
        {
          artifactId: "artifact-1",
          artifactType: "protocol_suggestion",
          artifactTitle: "Protocol: researchQuestion",
          artifactStatus: "proposed",
          emitToClient: true,
        },
      ],
    });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Set research question to RQ",
      projectId: "p1",
      userId: "u1",
      parentRunId: "run-1",
      conversationId: "conv-1",
      autonomyConfig: { preset: "assisted", toolOverrides: {} },
    });

    expect(result.error).toBeUndefined();
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        artifactId: "artifact-1",
        artifactStatus: "proposed",
      }),
    ]);
    expect(mocks.executeToolWithAutonomyCore).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        artifactRunId: "run-1",
        levelOneBehavior: "block",
        cachedAutonomyConfig: { preset: "assisted", toolOverrides: {} },
      }),
    );
    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        parentRunId: "run-1",
      }),
    );
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "completed");
  });

  it("preserves delegated ask_user sentinel and pauses the child run", async () => {
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield {
        type: "tool_call",
        toolCall: {
          id: "tc1",
          name: "ask_user",
          arguments: { question: "Which population?", questionType: "free_text" },
        },
      };
    });

    mocks.executeToolWithAutonomyCore.mockResolvedValue({
      callId: "tc1",
      result: null,
      requiresUserInput: true,
      userInputRequest: {
        callId: "tc1",
        question: "Which population?",
        questionType: "free_text",
      },
    });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Clarify the population",
      projectId: "p1",
      userId: "u1",
      parentRunId: "run-1",
    });

    expect(result.stopReason).toBe("paused_for_input");
    expect(result.requiresUserInput).toBe(true);
    expect(result.userInputRequest).toEqual({
      callId: "tc1",
      question: "Which population?",
      questionType: "free_text",
    });
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "paused");
  });

  it("propagates system context + abort signal into shared delegated execution", async () => {
    const controller = new AbortController();

    mocks.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc1",
            name: "update_protocol",
            arguments: { field: "researchQuestion", value: "RQ2", rationale: "test" },
          },
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "done" };
      });

    mocks.executeToolWithAutonomyCore.mockResolvedValue({
      callId: "tc1",
      result: { ok: true },
    });

    const systemContexts = {
      projectContext: "Project context",
      protocolContext: "Protocol context",
      ledgerContext: "Ledger context",
    };

    await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
      projectId: "p1",
      userId: "u1",
      parentRunId: "run-1",
      conversationId: "conv-1",
      systemContexts,
      signal: controller.signal,
    });

    expect(mocks.assembleSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        agentMode: "protocol",
        projectContext: "Project context",
        protocolContext: "Protocol context",
        ledgerContext: "Ledger context",
      }),
    );
    expect(mocks.executeToolWithAutonomyCore).toHaveBeenCalledWith(
      expect.objectContaining({
        service: expect.any(Object),
        parentRunId: "run-1",
        conversationId: "conv-1",
        runtimeContext: expect.objectContaining({
          signal: expect.any(AbortSignal),
          rootRunId: "sub-run-1",
          systemContexts,
        }),
      }),
    );
  });

  it("finalizes child run as failed when delegation is blocked by autonomy", async () => {
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield {
        type: "tool_call",
        toolCall: {
          id: "tc1",
          name: "update_protocol",
          arguments: { field: "researchQuestion", value: "RQ", rationale: "test" },
        },
      };
    });

    mocks.executeToolWithAutonomyCore.mockResolvedValue({
      callId: "tc1",
      result: null,
      error: 'Tool "update_protocol" requires direct approval before it can run.',
      blockedByAutonomy: true,
      blockedReason: "approval_required",
      errorMeta: {
        kind: "autonomy_blocked",
        code: "TOOL_APPROVAL_REQUIRED",
        retryable: false,
        source: "autonomy_policy",
        message: 'Tool "update_protocol" requires direct approval before it can run.',
      },
    });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Set research question",
      projectId: "p1",
      userId: "u1",
      parentRunId: "run-1",
    });

    expect(result.stopReason).toBe("error");
    expect(result.blockedByAutonomy).toBe(true);
    expect(result.blockedReason).toBe("approval_required");
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "failed");
  });

  it("preserves a successful child outcome when repeat protection stops later work", async () => {
    mocks.streamChat.mockImplementation(async function* () {
      yield {
        type: "tool_call",
        toolCall: {
          id: `tc-${mocks.streamChat.mock.calls.length}`,
          name: "update_protocol",
          arguments: { field: "researchQuestion", value: "RQ", rationale: "test" },
        },
      };
    });
    mocks.executeToolWithAutonomyCore.mockResolvedValue({
      callId: "tc",
      result: { ok: true },
    });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Set research question",
      projectId: "p1",
      userId: "u1",
      parentRunId: "run-1",
    });

    expect(result.stopReason).toBe("repeat_detected");
    expect(result.totalToolCalls).toBe(DOOM_LOOP_THRESHOLD);
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "completed");
  });

  it("cleans up a started child run when initialization event persistence fails", async () => {
    mocks.recordRunEvent.mockRejectedValueOnce(new Error("event write failed"));

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
      projectId: "p1",
      userId: "u1",
    });

    expect(result.stopReason).toBe("error");
    expect(result.error).toBe("event write failed");
    expect(mocks.heartbeatStop).toHaveBeenCalledTimes(1);
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "failed");
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("classifies an in-flight abort as cancellation", async () => {
    const controller = new AbortController();
    mocks.streamChat.mockImplementationOnce(async function* () {
      controller.abort();
      throw new DOMException("cancelled", "AbortError");
    });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
      signal: controller.signal,
    });

    expect(result.stopReason).toBe("cancelled");
    expect(result.error).toBeUndefined();
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "cancelled");
  });

  it("aborts a hung provider at the sub-agent wall-time budget", async () => {
    mocks.streamChat.mockImplementationOnce((_messages, options: { signal?: AbortSignal }) => ({
      async *[Symbol.asyncIterator]() {
        await new Promise<never>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            reject(new DOMException("deadline", "AbortError"));
          }, { once: true });
        });
      },
    }));

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
      budget: { maxWallTimeMs: 5 },
    });

    expect(result.stopReason).toBe("wall_time");
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "failed");
  });

  it("forwards the selected model to child run metadata and provider calls", async () => {
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield { type: "content", content: "Done." };
      yield { type: "done" };
    });

    await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
      model: "gpt-5.2",
    });

    expect(mocks.startRun).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5.2" }));
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ model: "gpt-5.2" }),
    );
  });

  it("does not report child success when durable endRun finalization fails", async () => {
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield { type: "content", content: "Done." };
      yield { type: "done" };
    });
    mocks.endRun.mockRejectedValueOnce(new Error("finalization write failed"));

    await expect(executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
    })).rejects.toThrow("finalization write failed");

    expect(mocks.markRunFinalizationState).toHaveBeenCalledTimes(1);
    expect(mocks.markRunFinalizationState).toHaveBeenCalledWith("sub-run-1", "in_progress");
    expect(mocks.endRun).toHaveBeenCalledTimes(1);
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "completed");
    expect(mocks.markRunFinalizationFailed).toHaveBeenCalledWith("sub-run-1");
    expect(mocks.heartbeatStop).toHaveBeenCalledTimes(1);
  });

  it("adopts a matching externally completed child without double finalization", async () => {
    const ownershipError = Object.assign(new Error("child run already finalized"), {
      runId: "sub-run-1",
      status: "completed",
      finalizationState: "completed",
    });
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield { type: "content", content: "Done." };
      yield { type: "done" };
    });
    mocks.endRun.mockRejectedValueOnce(ownershipError);
    mocks.isRunOwnershipError.mockImplementation((error) => error === ownershipError);

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
    });

    expect(result.error).toBeUndefined();
    expect(result.stopReason).toBe("natural");
    expect(mocks.endRun).toHaveBeenCalledTimes(1);
    expect(mocks.getRun).not.toHaveBeenCalled();
    expect(mocks.markRunFinalizationFailed).not.toHaveBeenCalled();
  });

  it("adopts terminal ownership truth before endRun without issuing a second finalization write", async () => {
    const ownershipError = Object.assign(new Error("child run already completed"), {
      runId: "sub-run-1",
      status: "completed",
      finalizationState: "completed",
    });
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield { type: "content", content: "Done." };
      yield { type: "done" };
    });
    mocks.markRunFinalizationState.mockRejectedValueOnce(ownershipError);
    mocks.isRunOwnershipError.mockImplementation((error) => error === ownershipError);

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
    });

    expect(result.error).toBeUndefined();
    expect(mocks.markRunFinalizationState).toHaveBeenCalledTimes(1);
    expect(mocks.endRun).not.toHaveBeenCalled();
    expect(mocks.getRun).not.toHaveBeenCalled();
  });

  it("rejects logical success when ownership loss reveals a different child terminal status", async () => {
    const ownershipError = Object.assign(new Error("child run cancelled elsewhere"), {
      runId: "sub-run-1",
      status: "cancelled",
      finalizationState: "completed",
    });
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield { type: "content", content: "Done." };
      yield { type: "done" };
    });
    mocks.endRun.mockRejectedValueOnce(ownershipError);
    mocks.isRunOwnershipError.mockImplementation((error) => error === ownershipError);

    await expect(executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
    })).rejects.toThrow("Child run finalized as cancelled instead of completed");

    expect(mocks.endRun).toHaveBeenCalledTimes(1);
    expect(mocks.markRunFinalizationFailed).not.toHaveBeenCalled();
  });

  it("inspects and adopts matching terminal truth after non-terminal ownership loss", async () => {
    const ownershipError = Object.assign(new Error("child finalization lease lost"), {
      runId: "sub-run-1",
      status: "running",
      finalizationState: "in_progress",
    });
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield { type: "content", content: "Done." };
      yield { type: "done" };
    });
    mocks.endRun.mockRejectedValueOnce(ownershipError);
    mocks.isRunOwnershipError.mockImplementation((error) => error === ownershipError);
    mocks.getRun.mockResolvedValueOnce({ id: "sub-run-1", status: "completed" });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
    });

    expect(result.error).toBeUndefined();
    expect(mocks.getRun).toHaveBeenCalledWith("sub-run-1");
    expect(mocks.endRun).toHaveBeenCalledTimes(1);
  });

  it("does not execute an oversized initial tool-call batch", async () => {
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield {
        type: "tool_call",
        toolCall: { id: "tc1", name: "update_protocol", arguments: { field: "researchQuestion", value: "A", rationale: "test" } },
      };
      yield {
        type: "tool_call",
        toolCall: { id: "tc2", name: "update_protocol", arguments: { field: "researchQuestion", value: "B", rationale: "test" } },
      };
    });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
      budget: { maxToolCalls: 1 },
    });

    expect(result.stopReason).toBe("max_tool_calls");
    expect(result.totalToolCalls).toBe(0);
    expect(mocks.executeToolWithAutonomyCore).not.toHaveBeenCalled();
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "failed");
  });

  it("stops before execution when the durable lineage tool budget rejects the batch", async () => {
    const lineageBudgetError = new Error("lineage tool budget reached");
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield {
        type: "tool_call",
        toolCall: {
          id: "tc1",
          name: "update_protocol",
          arguments: { field: "researchQuestion", value: "A", rationale: "test" },
        },
      };
    });
    mocks.preRecordToolCallBatchForAutonomy.mockRejectedValueOnce(lineageBudgetError);
    mocks.isRunLineageToolBudgetExceededError.mockImplementation(
      (error) => error === lineageBudgetError,
    );

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
    });

    expect(result.stopReason).toBe("max_tool_calls");
    expect(mocks.executeToolWithAutonomyCore).not.toHaveBeenCalled();
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "failed");
  });

  it("treats a successful tool as useful output when the iteration budget ends", async () => {
    mocks.streamChat.mockImplementationOnce(async function* () {
      yield {
        type: "tool_call",
        toolCall: { id: "tc1", name: "update_protocol", arguments: { field: "researchQuestion", value: "A", rationale: "test" } },
      };
    });
    mocks.executeToolWithAutonomyCore.mockResolvedValue({ callId: "tc1", result: { ok: true } });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Update protocol",
      budget: { maxIterations: 1 },
    });

    expect(result.stopReason).toBe("max_iterations");
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "completed");
  });

  it("returns cancelled immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await executeSubAgent({
      mode: "search",
      task: "Find studies",
      signal: controller.signal,
    });

    expect(result.stopReason).toBe("cancelled");
    expect(result.iterations).toBe(0);
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "cancelled");
  });
});
