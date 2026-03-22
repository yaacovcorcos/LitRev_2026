import { describe, expect, it } from "vitest";

import { createInitialSharedStreamState } from "@/lib/ai/shared-stream-reducer";
import { deriveSharedRuntimeUiState } from "@/lib/ai/shared-runtime-ui-state";

describe("deriveSharedRuntimeUiState", () => {
  it("reports tool-running phase from shared runtime truth", () => {
    const state = createInitialSharedStreamState({
      runningToolCallIds: ["tool-1"],
    });

    const uiState = deriveSharedRuntimeUiState({
      isStreaming: true,
      currentRunId: "run-1",
      streamState: state,
    });

    expect(uiState.liveState).toBe("running");
    expect(uiState.streamPhase).toBe("tool_running");
    expect(uiState.sendLocked).toBe(false);
  });

  it("treats pending user input as a blocked explicit-action state", () => {
    const state = createInitialSharedStreamState({
      pendingUserInputRequest: {
        callId: "ask-1",
        question: "Continue?",
        questionType: "yes_no",
      },
      lastRunStatus: "paused",
      lastStopReason: "paused_for_input",
    });

    const uiState = deriveSharedRuntimeUiState({
      isStreaming: false,
      currentRunId: null,
      streamState: state,
    });

    expect(uiState.liveState).toBe("blocked");
    expect(uiState.hasPendingUserInput).toBe(true);
    expect(uiState.sendLocked).toBe(true);
  });

  it("locks queued follow-ups when recovery still requires an explicit next action", () => {
    const state = createInitialSharedStreamState({
      latestRecoveryRecommendation: "continue_from_durable_state",
    });

    const uiState = deriveSharedRuntimeUiState({
      isStreaming: false,
      currentRunId: "run-1",
      streamState: state,
    });

    expect(uiState.liveState).toBe("recovering");
    expect(uiState.recoveryRecommendation).toBe("continue_from_durable_state");
    expect(uiState.sendLocked).toBe(true);
  });

  it("does not lock idle surfaces after retry is the truthful next step", () => {
    const state = createInitialSharedStreamState({
      latestRecoveryRecommendation: "retry",
    });

    const uiState = deriveSharedRuntimeUiState({
      isStreaming: false,
      currentRunId: null,
      streamState: state,
    });

    expect(uiState.liveState).toBe("idle");
    expect(uiState.sendLocked).toBe(false);
  });
});
