import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  getToolDefinitions: vi.fn(),
  executeTool: vi.fn(),
  createArtifact: vi.fn(),
  applyArtifact: vi.fn(),
  assembleSystemPrompt: vi.fn(() => "SYSTEM"),
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

const { executeSubAgent } = await import("@/lib/server/ai/sub-agent");

describe("executeSubAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToolDefinitions.mockReturnValue([
      { name: "update_protocol", description: "d", parameters: {} },
    ]);
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
  });
});

