export type ChatSurface = "ai" | "project";

export type ChatUnificationStreamPhase = "send" | "plan" | "project_stream";

export type ChatUnificationMetricType =
  | "retry_model_continuity"
  | "ask_user_context_mismatch"
  | "stuck_running_tools_after_run_end"
  | "run_end_observed";

export type ChatUnificationActualModelSource = "provider" | "requested" | "unknown";

export type RetryModelContinuityPayload = {
  preserved: boolean;
  expectedModel: string | null;
  actualModel: string | null;
  source: "retry_action";
};

export type AskUserContextMismatchPayload = {
  mismatch: boolean;
  expectedPage: string | null;
  expectedSection: string | null;
  resolvedPage: string | null;
  resolvedSection: string | null;
};

export type StuckRunningToolsPayload = {
  unresolvedCount: number;
  runStatus: string | null;
  streamPhase: ChatUnificationStreamPhase;
};

export type RunEndObservedPayload = {
  runStatus: string | null;
  streamPhase: ChatUnificationStreamPhase;
  actualModel: string | null;
  actualModelSource: ChatUnificationActualModelSource;
};

export type ChatUnificationMetricPayloadByType = {
  retry_model_continuity: RetryModelContinuityPayload;
  ask_user_context_mismatch: AskUserContextMismatchPayload;
  stuck_running_tools_after_run_end: StuckRunningToolsPayload;
  run_end_observed: RunEndObservedPayload;
};

export type ChatUnificationMetricPayload =
  ChatUnificationMetricPayloadByType[ChatUnificationMetricType];

export type ChatUnificationMetricEvent = {
  eventId: string;
  version: 1;
  type: ChatUnificationMetricType;
  surface: ChatSurface;
  timestamp: string;
  runId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  payload: ChatUnificationMetricPayload;
};

export type ChatUnificationMetricInput = {
  eventId: string;
  version?: 1;
  type: ChatUnificationMetricType;
  surface: ChatSurface;
  runId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  clientTimestamp?: string | null;
  payload: ChatUnificationMetricPayload;
};
