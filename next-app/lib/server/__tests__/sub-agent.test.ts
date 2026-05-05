import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  getToolDefinitions: vi.fn(),
  evaluateToolPrerequisites: vi.fn(),
  executeToolWithAutonomyCore: vi.fn(),
  assembleSystemPrompt: vi.fn(() => "SYSTEM"),
  startRun: vi.fn(),
  endRun: vi.fn(),
  startRunHeartbeat: vi.fn(() => ({ stop: vi.fn() })),
  emitEvent: vi.fn(),
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
  endRun: mocks.endRun,
  startRunHeartbeat: mocks.startRunHeartbeat,
}));

vi.mock("@/lib/server/agent/events", () => ({
  emitEvent: mocks.emitEvent,
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
    mocks.startRun.mockResolvedValue({ id: "sub-run-1" });
    mocks.endRun.mockResolvedValue({ id: "sub-run-1" });
    mocks.emitEvent.mockResolvedValue({ id: "evt-1" });
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
          signal: controller.signal,
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

  it("finalizes child run as failed when delegated tool calls repeat until the loop guard stops it", async () => {
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
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "failed");
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
