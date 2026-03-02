export type ChatSurface = "ai" | "project";

export type ChatUnificationMetricType =
  | "retry_model_continuity"
  | "ask_user_context_mismatch"
  | "stuck_running_tools_after_run_end";

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
  streamPhase: "send" | "plan" | "project_stream";
};

export type ChatUnificationMetricPayload =
  | RetryModelContinuityPayload
  | AskUserContextMismatchPayload
  | StuckRunningToolsPayload;

export type ChatUnificationMetricEvent = {
  version: 1;
  type: ChatUnificationMetricType;
  surface: ChatSurface;
  timestamp: string;
  runId?: string | null;
  conversationId?: string | null;
  payload: ChatUnificationMetricPayload;
};

const STORAGE_KEY = "litrev:chat-unification-metrics:v1";
const STORAGE_LIMIT = 2000;
const METRIC_EVENT = "litrev:chat-unification-metric";

function readEventsFromStorage(): ChatUnificationMetricEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((event) => event && typeof event === "object") as ChatUnificationMetricEvent[];
  } catch {
    return [];
  }
}

export function recordChatUnificationMetric(
  event: Omit<ChatUnificationMetricEvent, "version" | "timestamp">,
): void {
  if (typeof window === "undefined") return;

  const normalized: ChatUnificationMetricEvent = {
    version: 1,
    timestamp: new Date().toISOString(),
    ...event,
  };

  window.dispatchEvent(new CustomEvent<ChatUnificationMetricEvent>(METRIC_EVENT, { detail: normalized }));

  try {
    const existing = readEventsFromStorage();
    const next = [...existing, normalized];
    const bounded = next.length > STORAGE_LIMIT ? next.slice(next.length - STORAGE_LIMIT) : next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Best-effort telemetry only.
  }
}

export function getChatUnificationMetricEvents(): ChatUnificationMetricEvent[] {
  return readEventsFromStorage();
}

export type ChatUnificationMetricSummary = {
  retryModelContinuity: {
    total: number;
    preserved: number;
    rate: number;
  };
  askUserContextMismatch: {
    total: number;
    mismatches: number;
    rate: number;
  };
  stuckRunningToolsAfterRunEnd: {
    total: number;
    violations: number;
    rate: number;
  };
};

export function summarizeChatUnificationMetrics(
  events: ChatUnificationMetricEvent[] = getChatUnificationMetricEvents(),
): ChatUnificationMetricSummary {
  const retryEvents = events.filter((event) => event.type === "retry_model_continuity");
  const askUserEvents = events.filter((event) => event.type === "ask_user_context_mismatch");
  const stuckEvents = events.filter((event) => event.type === "stuck_running_tools_after_run_end");

  const preserved = retryEvents.filter((event) => {
    const payload = event.payload as RetryModelContinuityPayload;
    return payload.preserved;
  }).length;

  const mismatches = askUserEvents.filter((event) => {
    const payload = event.payload as AskUserContextMismatchPayload;
    return payload.mismatch;
  }).length;

  const violations = stuckEvents.filter((event) => {
    const payload = event.payload as StuckRunningToolsPayload;
    return payload.unresolvedCount > 0;
  }).length;

  return {
    retryModelContinuity: {
      total: retryEvents.length,
      preserved,
      rate: retryEvents.length > 0 ? preserved / retryEvents.length : 1,
    },
    askUserContextMismatch: {
      total: askUserEvents.length,
      mismatches,
      rate: askUserEvents.length > 0 ? mismatches / askUserEvents.length : 0,
    },
    stuckRunningToolsAfterRunEnd: {
      total: stuckEvents.length,
      violations,
      rate: stuckEvents.length > 0 ? violations / stuckEvents.length : 0,
    },
  };
}

export function clearChatUnificationMetrics(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort cleanup only.
  }
}
