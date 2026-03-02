import type {
  AskUserContextMismatchPayload,
  ChatUnificationMetricEvent,
  RunEndObservedPayload,
  RetryModelContinuityPayload,
  StuckRunningToolsPayload,
} from "@/types/chat-unification";

const STORAGE_KEY = "litrev:chat-unification-metrics:v1";
const STORAGE_LIMIT = 2000;
const METRIC_EVENT = "litrev:chat-unification-metric";

function generateMetricEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `metric-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function computeRate(total: number, numerator: number): number | null {
  if (total <= 0) return null;
  return numerator / total;
}

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
  event: Omit<ChatUnificationMetricEvent, "eventId" | "version" | "timestamp">,
): void {
  if (typeof window === "undefined") return;

  const normalized: ChatUnificationMetricEvent = {
    eventId: generateMetricEventId(),
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
    rate: number | null;
    hasSample: boolean;
  };
  askUserContextMismatch: {
    total: number;
    mismatches: number;
    rate: number | null;
    hasSample: boolean;
  };
  stuckRunningToolsAfterRunEnd: {
    total: number;
    violations: number;
    rate: number | null;
    hasSample: boolean;
  };
  runEndObserved: {
    total: number;
    completed: number;
    rateCompleted: number | null;
    hasSample: boolean;
  };
};

export function summarizeChatUnificationMetrics(
  events: ChatUnificationMetricEvent[] = getChatUnificationMetricEvents(),
): ChatUnificationMetricSummary {
  const retryEvents = events.filter((event) => event.type === "retry_model_continuity");
  const askUserEvents = events.filter((event) => event.type === "ask_user_context_mismatch");
  const stuckEvents = events.filter((event) => event.type === "stuck_running_tools_after_run_end");
  const runEndEvents = events.filter((event) => event.type === "run_end_observed");

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
  const completedRuns = runEndEvents.filter((event) => {
    const payload = event.payload as RunEndObservedPayload;
    return payload.runStatus === "completed";
  }).length;

  return {
    retryModelContinuity: {
      total: retryEvents.length,
      preserved,
      rate: computeRate(retryEvents.length, preserved),
      hasSample: retryEvents.length > 0,
    },
    askUserContextMismatch: {
      total: askUserEvents.length,
      mismatches,
      rate: computeRate(askUserEvents.length, mismatches),
      hasSample: askUserEvents.length > 0,
    },
    stuckRunningToolsAfterRunEnd: {
      total: stuckEvents.length,
      violations,
      rate: computeRate(stuckEvents.length, violations),
      hasSample: stuckEvents.length > 0,
    },
    runEndObserved: {
      total: runEndEvents.length,
      completed: completedRuns,
      rateCompleted: computeRate(runEndEvents.length, completedRuns),
      hasSample: runEndEvents.length > 0,
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
