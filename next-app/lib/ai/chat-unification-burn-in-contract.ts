import type { ChatSurface, ChatUnificationMetricType } from "@/types/chat-unification";

export const CHAT_UNIFICATION_BURN_IN_SURFACES = [
  "ai",
  "project",
] as const satisfies readonly ChatSurface[];

export const CHAT_UNIFICATION_BURN_IN_METRIC_TYPES = [
  "retry_model_continuity",
  "ask_user_context_mismatch",
  "stuck_running_tools_after_run_end",
  "run_end_observed",
] as const satisfies readonly ChatUnificationMetricType[];
