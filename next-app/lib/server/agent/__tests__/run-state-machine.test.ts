import { describe, expect, it } from "vitest";
import {
  getRunPhaseForEventType,
  getRunPhaseTransitionMatrix,
  isRunPhaseTransitionAllowed,
  isTerminalRunStatus,
} from "@/lib/server/agent/run-state-machine";

describe("run state machine", () => {
  it("keeps continuation re-planning as an explicit legal phase transition", () => {
    expect(getRunPhaseTransitionMatrix()).toMatchObject({
      verify: expect.arrayContaining(["plan"]),
    });
    expect(isRunPhaseTransitionAllowed("verify", "plan")).toBe(true);
    expect(isRunPhaseTransitionAllowed("finalize", "plan")).toBe(false);
  });

  it("maps runtime events to their coarse persisted phases", () => {
    expect(getRunPhaseForEventType("plan_proposed")).toBe("plan");
    expect(getRunPhaseForEventType("plan_approved")).toBe("act");
    expect(getRunPhaseForEventType("tool_call")).toBe("act");
    expect(getRunPhaseForEventType("tool_result")).toBe("verify");
    expect(getRunPhaseForEventType("artifact_proposed")).toBe("verify");
    expect(getRunPhaseForEventType("artifact_reviewed")).toBe("verify");
    expect(getRunPhaseForEventType("user_input_required")).toBe("ask");
  });

  it("only returns act for user-input resolution while the source run is active", () => {
    expect(getRunPhaseForEventType("user_input_resolved", {
      status: "running",
      runPhase: "ask",
    })).toBe("act");
    expect(getRunPhaseForEventType("user_input_resolved", {
      status: "paused",
      runPhase: "ask",
    })).toBeNull();
  });

  it("recognizes terminal run statuses for reconciliation", () => {
    expect(isTerminalRunStatus("completed")).toBe(true);
    expect(isTerminalRunStatus("failed")).toBe(true);
    expect(isTerminalRunStatus("cancelled")).toBe(true);
    expect(isTerminalRunStatus("paused")).toBe(true);
    expect(isTerminalRunStatus("running")).toBe(false);
  });
});
