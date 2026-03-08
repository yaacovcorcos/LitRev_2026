import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultProtocolData } from "@/types/protocol";

const mocks = vi.hoisted(() => ({
  executeSubAgent: vi.fn(),
}));

vi.mock("@/lib/server/ai/sub-agent", () => ({
  executeSubAgent: mocks.executeSubAgent,
}));

const { delegateSearchTool } = await import("@/lib/server/ai/tools/delegate-search");
const { delegateScreeningTool } = await import("@/lib/server/ai/tools/delegate-screening");
const { delegateProtocolTool } = await import("@/lib/server/ai/tools/delegate-protocol");

const BASE_SUB_AGENT_RESULT = {
  summary: "delegated",
  stopReason: "natural" as const,
  iterations: 1,
  totalToolCalls: 2,
  toolLog: [],
};

describe("delegation tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ENABLE_DELEGATION;
    delete process.env.NEXT_PUBLIC_ENABLE_DELEGATION;
    mocks.executeSubAgent.mockResolvedValue(BASE_SUB_AGENT_RESULT);
  });

  afterEach(() => {
    delete process.env.ENABLE_DELEGATION;
    delete process.env.NEXT_PUBLIC_ENABLE_DELEGATION;
  });

  it("blocks delegation tool execution when flag is off", async () => {
    process.env.ENABLE_DELEGATION = "0";

    const searchResult = await delegateSearchTool.execute({ task: "find diabetes trials" });
    const screeningResult = await delegateScreeningTool.execute({ task: "screen unscreened studies" });
    const protocolResult = await delegateProtocolTool.execute({ task: "update PICO" });

    expect(searchResult.error).toContain("disabled");
    expect(screeningResult.error).toContain("disabled");
    expect(protocolResult.error).toContain("disabled");
    expect(mocks.executeSubAgent).not.toHaveBeenCalled();
  });

  it("delegate_search forwards system context and signal and infers criteria/year from protocol data", async () => {
    process.env.ENABLE_DELEGATION = "1";
    const controller = new AbortController();
    const protocolData = createDefaultProtocolData();
    protocolData.eligibility.inclusion = ["adults >= 18"];
    protocolData.eligibility.exclusion = ["animal studies"];
    protocolData.methodology.timeFrameStart = "2019";
    protocolData.methodology.timeFrameEnd = "2024";
    protocolData.pico.population = "heart failure";
    protocolData.pico.intervention = "sglt2 inhibitor";

    const result = await delegateSearchTool.execute(
      { task: "find relevant evidence" },
      {
        projectId: "p1",
        userId: "u1",
        runId: "run-1",
        signal: controller.signal,
        protocolData,
        systemContexts: {
          projectContext: "Project: CHF review",
          protocolContext: "[PROTOCOL_CONTEXT] ...",
          ledgerContext: "[LEDGER_CONTEXT] ...",
        },
      },
    );

    expect(result.error).toBeUndefined();
    expect(mocks.executeSubAgent).toHaveBeenCalledTimes(1);
    const call = mocks.executeSubAgent.mock.calls[0][0] as Record<string, unknown>;
    expect(call.mode).toBe("search");
    expect(call.signal).toBe(controller.signal);
    expect(call.systemContexts).toEqual({
      projectContext: "Project: CHF review",
      protocolContext: "[PROTOCOL_CONTEXT] ...",
      ledgerContext: "[LEDGER_CONTEXT] ...",
    });
    expect(call.task).toEqual(expect.stringContaining("Exclusion criteria"));
    expect(call.task).toEqual(expect.stringContaining("2019:2024[dp]"));
    expect((result.result as { searchPlanUsed: boolean }).searchPlanUsed).toBe(true);
  });

  it("delegate_search tolerates protocol data with missing methodology", async () => {
    process.env.ENABLE_DELEGATION = "1";
    const controller = new AbortController();
    const protocolData = createDefaultProtocolData();
    // Simulate legacy/partial protocol payloads that may miss nested fields.
    (protocolData as unknown as { methodology?: unknown }).methodology = undefined;

    const result = await delegateSearchTool.execute(
      { task: "find relevant evidence" },
      {
        projectId: "p1",
        userId: "u1",
        runId: "run-1",
        signal: controller.signal,
        protocolData,
      },
    );

    expect(result.error).toBeUndefined();
    expect(mocks.executeSubAgent).toHaveBeenCalledTimes(1);
  });

  it("delegate_screening forwards study scope and runtime context", async () => {
    process.env.ENABLE_DELEGATION = "1";
    const controller = new AbortController();

    await delegateScreeningTool.execute(
      { task: "screen pending studies" },
      {
        projectId: "p1",
        userId: "u1",
        studyId: "s1",
        runId: "run-1",
        signal: controller.signal,
        systemContexts: { protocolContext: "[PROTOCOL_CONTEXT] inclusion/exclusion" },
      },
    );

    expect(mocks.executeSubAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "screening",
        projectId: "p1",
        userId: "u1",
        studyId: "s1",
        parentRunId: "run-1",
        signal: controller.signal,
        systemContexts: { protocolContext: "[PROTOCOL_CONTEXT] inclusion/exclusion" },
      }),
    );
  });

  it("delegate_protocol forwards runtime context", async () => {
    process.env.ENABLE_DELEGATION = "1";
    const controller = new AbortController();

    await delegateProtocolTool.execute(
      { task: "add exclusion criterion for non-English studies" },
      {
        projectId: "p1",
        userId: "u1",
        runId: "run-1",
        signal: controller.signal,
        systemContexts: { projectContext: "Project: liver fibrosis review" },
      },
    );

    expect(mocks.executeSubAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "protocol",
        projectId: "p1",
        userId: "u1",
        parentRunId: "run-1",
        conversationId: undefined,
        signal: controller.signal,
        systemContexts: { projectContext: "Project: liver fibrosis review" },
      }),
    );
  });

  it("delegate tools preserve delegated clarification and autonomy-blocked sentinels", async () => {
    process.env.ENABLE_DELEGATION = "1";
    mocks.executeSubAgent.mockResolvedValueOnce({
      summary: "Need clarification",
      stopReason: "paused_for_input",
      iterations: 1,
      totalToolCalls: 1,
      toolLog: [],
      requiresUserInput: true,
      userInputRequest: {
        callId: "tc-ask",
        question: "Which study?",
        questionType: "free_text",
      },
    });
    mocks.executeSubAgent.mockResolvedValueOnce({
      summary: "Blocked",
      stopReason: "error",
      iterations: 1,
      totalToolCalls: 1,
      toolLog: [],
      error: 'Tool "update_protocol" requires direct approval before it can run.',
      blockedByAutonomy: true,
      blockedReason: "approval_required",
      artifacts: [
        {
          artifactId: "artifact-1",
          artifactType: "protocol_suggestion",
          artifactTitle: "Protocol: researchQuestion",
          artifactStatus: "proposed",
        },
      ],
    });

    const clarification = await delegateSearchTool.execute(
      { task: "clarify search target" },
      { projectId: "p1", userId: "u1", runId: "run-1", conversationId: "conv-1" },
    );
    const blocked = await delegateProtocolTool.execute(
      { task: "update protocol" },
      { projectId: "p1", userId: "u1", runId: "run-1", conversationId: "conv-1" },
    );

    expect(clarification.requiresUserInput).toBe(true);
    expect(clarification.userInputRequest).toEqual({
      callId: "tc-ask",
      question: "Which study?",
      questionType: "free_text",
    });
    expect(blocked.blockedByAutonomy).toBe(true);
    expect(blocked.blockedReason).toBe("approval_required");
    expect(blocked.artifacts).toEqual([
      expect.objectContaining({
        artifactId: "artifact-1",
        artifactStatus: "proposed",
      }),
    ]);
  });
});
