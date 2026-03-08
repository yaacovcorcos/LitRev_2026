import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const span = {
    update: vi.fn().mockReturnThis(),
    end: vi.fn(),
  };
  return {
    emitEvent: vi.fn(),
    createArtifact: vi.fn(),
    applyArtifact: vi.fn(),
    isToolAllowedInScope: vi.fn(),
    getTool: vi.fn(),
    resolveAutonomyLevel: vi.fn(),
    getEffectiveAllowedTools: vi.fn(),
    getAutonomyConfig: vi.fn(),
    getToolAutonomyLevel: vi.fn(),
    startToolSpan: vi.fn(() => span),
    span,
  };
});

vi.mock("@/lib/server/agent/events", () => ({
  emitEvent: mocks.emitEvent,
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
  createArtifact: mocks.createArtifact,
  applyArtifact: mocks.applyArtifact,
}));

vi.mock("@/lib/server/ai/tools", () => ({
  isToolAllowedInScope: mocks.isToolAllowedInScope,
  getTool: mocks.getTool,
  resolveAutonomyLevel: mocks.resolveAutonomyLevel,
}));

vi.mock("@/lib/agent/router", () => ({
  getEffectiveAllowedTools: mocks.getEffectiveAllowedTools,
}));

vi.mock("@/lib/server/agent/autonomy", () => ({
  getAutonomyConfig: mocks.getAutonomyConfig,
  getToolAutonomyLevel: mocks.getToolAutonomyLevel,
}));

vi.mock("@/lib/server/ai/tracing", () => ({
  startToolSpan: mocks.startToolSpan,
  NOOP_SPAN: {},
}));

const { executeToolWithAutonomy, executeToolWithAutonomyCore } = await import("@/lib/server/ai/tool-autonomy");

describe("tool-autonomy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emitEvent.mockResolvedValue(undefined);
    mocks.createArtifact.mockResolvedValue(undefined);
    mocks.applyArtifact.mockResolvedValue(undefined);
    mocks.isToolAllowedInScope.mockReturnValue(true);
    mocks.getEffectiveAllowedTools.mockReturnValue([]);
    mocks.getAutonomyConfig.mockResolvedValue({ preset: "assisted", toolOverrides: {} });
    mocks.getToolAutonomyLevel.mockReturnValue(3);
    mocks.resolveAutonomyLevel.mockImplementation((_toolName, level) => level);
    mocks.getTool.mockReturnValue({
      definition: { name: "delegate_protocol", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [2, 4] },
    });
  });

  it("emits parent-visible artifact chunks from delegated artifact metadata", async () => {
    const service = {
      executeToolWithMiddleware: vi.fn().mockResolvedValue({
        callId: "tc1",
        result: {
          success: true,
          summary: "delegated",
          toolCallCount: 1,
          stopReason: "natural",
        },
        artifacts: [
          {
            artifactId: "artifact-1",
            artifactType: "protocol_suggestion",
            artifactTitle: "Protocol: researchQuestion",
            artifactStatus: "proposed",
            artifactPayload: { field: "researchQuestion", value: "RQ" },
            artifactVersion: 1,
            emitToClient: true,
          },
        ],
      }),
    };

    const gen = executeToolWithAutonomy(
      service as never,
      {
        id: "tc1",
        name: "delegate_protocol",
        arguments: { task: "update protocol" },
      },
      "run-1",
      "project-1",
      "conversation-1",
      "user-1",
      "general",
    );

    const first = await gen.next();
    expect(first.done).toBe(false);
    expect(first.value).toEqual(
      expect.objectContaining({
        type: "artifact",
        artifactId: "artifact-1",
        artifactStatus: "proposed",
      }),
    );

    const second = await gen.next();
    expect(second.done).toBe(true);
    expect((second.value as { artifacts?: unknown[] }).artifacts).toEqual([
      expect.objectContaining({
        artifactId: "artifact-1",
        artifactStatus: "proposed",
      }),
    ]);
  });

  it("returns structured blocked-by-autonomy results for delegated level-1 execution", async () => {
    mocks.getTool.mockReturnValue({
      definition: { name: "update_protocol", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [2, 4] },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(1);

    const result = await executeToolWithAutonomyCore({
      service: {
        executeToolWithMiddleware: vi.fn(),
      } as never,
      toolCall: {
        id: "tc1",
        name: "update_protocol",
        arguments: { field: "researchQuestion", value: "RQ" },
      },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      agentMode: "protocol",
      levelOneBehavior: "block",
    });

    expect(result.blockedByAutonomy).toBe(true);
    expect(result.blockedReason).toBe("approval_required");
    expect(result.errorMeta).toEqual(
      expect.objectContaining({
        kind: "autonomy_blocked",
        code: "TOOL_APPROVAL_REQUIRED",
        retryable: false,
      }),
    );
  });
});
