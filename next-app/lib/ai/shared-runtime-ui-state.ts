import type { SharedStreamState } from "@/lib/ai/shared-stream-reducer";
import type { RunRecoveryRecommendation, StreamPhase } from "@/types/ai";

export type SharedRuntimeUiLiveState =
  | "idle"
  | "running"
  | "blocked"
  | "recovering";

export type SharedRuntimeUiState = {
  isStreaming: boolean;
  streamPhase: StreamPhase;
  liveState: SharedRuntimeUiLiveState;
  hasPendingUserInput: boolean;
  recoveryRecommendation: RunRecoveryRecommendation | null;
  requiresExplicitUserAction: boolean;
  sendLocked: boolean;
};

const EXPLICIT_USER_ACTION_RECOVERY_RECOMMENDATIONS = new Set<RunRecoveryRecommendation>([
  "reconnect",
  "stop_and_retry",
  "continue_from_checkpoint",
  "continue_from_durable_state",
]);

type SharedRuntimeUiSelectorInput = {
  isStreaming: boolean;
  currentRunId: string | null;
  streamState: Pick<
    SharedStreamState,
    "runningToolCallIds" | "pendingUserInputRequest" | "lastRunStatus" | "latestRecoveryRecommendation"
  >;
};

export function deriveSharedRuntimeUiState(
  params: SharedRuntimeUiSelectorInput,
): SharedRuntimeUiState {
  const hasPendingUserInput = Boolean(params.streamState.pendingUserInputRequest);
  const recoveryRecommendation = params.streamState.latestRecoveryRecommendation ?? null;
  const requiresRecoveryAction = Boolean(
    params.currentRunId
      && recoveryRecommendation
      && EXPLICIT_USER_ACTION_RECOVERY_RECOMMENDATIONS.has(recoveryRecommendation),
  );

  let streamPhase: StreamPhase = "idle";
  if (params.isStreaming) {
    if (params.streamState.lastRunStatus) {
      streamPhase = "completing";
    } else if (params.streamState.runningToolCallIds.length > 0) {
      streamPhase = "tool_running";
    } else {
      streamPhase = "streaming";
    }
  }

  let liveState: SharedRuntimeUiLiveState = "idle";
  if (params.isStreaming) {
    liveState = "running";
  } else if (hasPendingUserInput) {
    liveState = "blocked";
  } else if (requiresRecoveryAction) {
    liveState = "recovering";
  }

  const requiresExplicitUserAction = hasPendingUserInput || requiresRecoveryAction;

  return {
    isStreaming: params.isStreaming,
    streamPhase,
    liveState,
    hasPendingUserInput,
    recoveryRecommendation,
    requiresExplicitUserAction,
    sendLocked: requiresExplicitUserAction,
  };
}
