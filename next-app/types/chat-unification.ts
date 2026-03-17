export type ChatSurface = "ai" | "project";

export type ChatUnificationStreamPhase = "send" | "plan" | "project_stream";
export const CHAT_UNIFICATION_METRIC_VERSION = 3 as const;
export const CHAT_UNIFICATION_ACCEPTED_METRIC_VERSIONS = [1, 2, CHAT_UNIFICATION_METRIC_VERSION] as const;
export type ChatUnificationMetricVersion = (typeof CHAT_UNIFICATION_ACCEPTED_METRIC_VERSIONS)[number];

export type ChatUnificationMetricType =
  | "retry_model_continuity"
  | "ask_user_context_mismatch"
  | "stuck_running_tools_after_run_end"
  | "run_end_observed"
  | "answer_stream_delivery";

export type ChatUnificationActualModelSource = "provider" | "requested" | "unknown";

export type RetryModelContinuitySource = "retry_action";

export type RetryModelExpectation = {
  requestKey: string;
  expectedModel: string | null;
  source: RetryModelContinuitySource;
};

export type RetryModelContinuityPayloadV3 = {
  requestKey: string;
  expectedModel: string | null;
  source: RetryModelContinuitySource;
};

export type RetryModelContinuityPayloadLegacy = {
  preserved: boolean;
  expectedModel: string | null;
  actualModel: string | null;
  actualModelSource?: ChatUnificationActualModelSource;
  source: RetryModelContinuitySource;
};

export type RetryModelContinuityPayload =
  | RetryModelContinuityPayloadV3
  | RetryModelContinuityPayloadLegacy;

export type AskUserContextMismatchPayload = {
  mismatch: boolean;
  expectedPage: string | null;
  expectedSection: string | null;
  resolvedPage: string | null;
  resolvedSection: string | null;
};

export type StuckRunningToolsPayload = {
  unresolvedCount: number;
  unresolvedCountBeforeClear: number | null;
  unresolvedCountAfterClear: number | null;
  runStatus: string | null;
  streamPhase: ChatUnificationStreamPhase;
};

export type RunEndObservedPayload = {
  requestKey?: string | null;
  runStatus: string | null;
  streamPhase: ChatUnificationStreamPhase;
  actualModel: string | null;
  actualModelSource: ChatUnificationActualModelSource;
  firstProviderContentMs?: number | null;
};

export type AnswerStreamDeliveryPayload = {
  requestKey: string;
  streamPhase: ChatUnificationStreamPhase;
  firstVisibleContentMs: number | null;
  visibleChunkCount: number;
  visibleChunkChars: number;
  maxVisibleChunkChars: number | null;
  meanVisibleChunkGapMs: number | null;
};

export type ChatUnificationMetricPayloadByType = {
  retry_model_continuity: RetryModelContinuityPayload;
  ask_user_context_mismatch: AskUserContextMismatchPayload;
  stuck_running_tools_after_run_end: StuckRunningToolsPayload;
  run_end_observed: RunEndObservedPayload;
  answer_stream_delivery: AnswerStreamDeliveryPayload;
};

export type ChatUnificationMetricPayload =
  ChatUnificationMetricPayloadByType[ChatUnificationMetricType];

export type ChatUnificationMetricEvent = {
  eventId: string;
  version: ChatUnificationMetricVersion;
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
  version?: ChatUnificationMetricVersion;
  type: ChatUnificationMetricType;
  surface: ChatSurface;
  runId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  clientTimestamp?: string | null;
  payload: ChatUnificationMetricPayload;
};
