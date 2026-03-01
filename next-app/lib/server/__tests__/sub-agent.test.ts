import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  getToolDefinitions: vi.fn(),
  executeTool: vi.fn(),
  createArtifact: vi.fn(),
  applyArtifact: vi.fn(),
  assembleSystemPrompt: vi.fn(() => "SYSTEM"),
  startRun: vi.fn(),
  endRun: vi.fn(),
  emitEvent: vi.fn(),
}));

vi.mock("@/lib/server/ai/ai-service", () => ({
  getAIService: () => ({
    streamChat: mocks.streamChat,
  }),
}));

vi.mock("@/lib/server/ai/tools/base", () => ({
  getToolDefinitions: mocks.getToolDefinitions,
  executeTool: mocks.executeTool,
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
  createArtifact: mocks.createArtifact,
  applyArtifact: mocks.applyArtifact,
}));

vi.mock("@/lib/ai/prompts/copilot-prompts", () => ({
  assembleSystemPrompt: mocks.assembleSystemPrompt,
}));

vi.mock("@/lib/server/agent/run", () => ({
  startRun: mocks.startRun,
  endRun: mocks.endRun,
}));

vi.mock("@/lib/server/agent/events", () => ({
  emitEvent: mocks.emitEvent,
}));

const { executeSubAgent } = await import("@/lib/server/ai/sub-agent");

describe("executeSubAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToolDefinitions.mockReturnValue([
      { name: "update_protocol", description: "d", parameters: {} },
    ]);
    mocks.startRun.mockResolvedValue({ id: "sub-run-1" });
    mocks.endRun.mockResolvedValue({ id: "sub-run-1" });
    mocks.emitEvent.mockResolvedValue({ id: "evt-1" });
  });

  it("auto-applies delegated proposal tools through artifact pipeline", async () => {
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

    mocks.executeTool.mockResolvedValue({
      callId: "tc1",
      result: { field: "researchQuestion", value: "RQ", rationale: "user requested" },
    });
    mocks.createArtifact.mockResolvedValue({ id: "artifact-1" });
    mocks.applyArtifact.mockResolvedValue({ id: "artifact-1" });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Set research question to RQ",
      projectId: "p1",
      userId: "u1",
      parentRunId: "run-1",
    });

    expect(result.error).toBeUndefined();
    expect(mocks.createArtifact).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "p1",
      userId: "u1",
      type: "protocol_suggestion",
      title: "Protocol: researchQuestion",
      payload: { field: "researchQuestion", value: "RQ", rationale: "user requested" },
    });
    expect(mocks.applyArtifact).toHaveBeenCalledWith("artifact-1", "auto_applied");
    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parentRunId: "run-1",
        projectId: "p1",
        agentMode: "protocol",
      }),
    );
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "completed");
  });

  it("skips artifact auto-apply when parent run context is unavailable", async () => {
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
        yield { type: "done" };
      });

    mocks.executeTool.mockResolvedValue({
      callId: "tc1",
      result: { field: "researchQuestion", value: "RQ", rationale: "user requested" },
    });

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Set research question to RQ",
      projectId: "p1",
      userId: "u1",
    });

    expect(result.error).toBeUndefined();
    expect(mocks.createArtifact).not.toHaveBeenCalled();
    expect(mocks.applyArtifact).not.toHaveBeenCalled();
    expect(mocks.endRun).toHaveBeenCalledWith("sub-run-1", "completed");
  });

  it("propagates system context + abort signal into sub-agent prompt and tool execution", async () => {
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

    mocks.executeTool.mockResolvedValue({
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
    expect(mocks.executeTool).toHaveBeenCalledWith(
      "update_protocol",
      { field: "researchQuestion", value: "RQ2", rationale: "test" },
      "tc1",
      expect.objectContaining({
        runId: "sub-run-1",
        signal: controller.signal,
        systemContexts,
      }),
    );
  });

  it("finalizes child run as failed when artifact auto-apply throws", async () => {
    mocks.streamChat
      .mockImplementationOnce(async function* () {
        yield {
          type: "tool_call",
          toolCall: {
            id: "tc1",
            name: "update_protocol",
            arguments: { field: "researchQuestion", value: "RQ", rationale: "test" },
          },
        };
      });

    mocks.executeTool.mockResolvedValue({
      callId: "tc1",
      result: { field: "researchQuestion", value: "RQ", rationale: "test" },
    });
    mocks.createArtifact.mockRejectedValue(new Error("DB write failed"));

    const result = await executeSubAgent({
      mode: "protocol",
      task: "Set research question",
      projectId: "p1",
      userId: "u1",
      parentRunId: "run-1",
    });

    expect(result.stopReason).toBe("error");
    expect(result.error).toContain("DB write failed");
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
