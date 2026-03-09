import type {
  AskUserContextMismatchPayload,
  ChatUnificationMetricInput,
  ChatUnificationMetricEvent,
  RunEndObservedPayload,
  RetryModelContinuityPayload,
  StuckRunningToolsPayload,
} from "@/types/chat-unification";
import { createClientTelemetryStore } from "@/lib/ai/client-telemetry-store";
import { CHAT_UNIFICATION_METRIC_VERSION } from "@/types/chat-unification";

const STORAGE_KEY = `litrev:chat-unification-metrics:v${CHAT_UNIFICATION_METRIC_VERSION}`;
const STORAGE_LIMIT = 2000;
const METRIC_EVENT = "litrev:chat-unification-metric";
const TELEMETRY_ENDPOINT = "/api/telemetry/chat-unification";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateUuidV4Fallback(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 version and variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function generateMetricEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return generateUuidV4Fallback();
}

export function generateChatUnificationRequestKey(): string {
  return generateMetricEventId();
}

function computeRate(total: number, numerator: number): number | null {
  if (total <= 0) return null;
  return numerator / total;
}

function payloadAsRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, unknown>;
}

function getPayloadRequestKey(payload: unknown): string | null {
  const record = payloadAsRecord(payload);
  const key = record?.requestKey;
  return typeof key === "string" && key.length > 0 ? key : null;
}

function toMetricInput(event: ChatUnificationMetricEvent): ChatUnificationMetricInput {
  return {
    eventId: event.eventId,
    version: event.version,
    type: event.type,
    surface: event.surface,
    runId: event.runId ?? null,
    conversationId: event.conversationId ?? null,
    projectId: event.projectId ?? null,
    clientTimestamp: event.timestamp,
    payload: event.payload,
  };
}

const telemetryStore = createClientTelemetryStore<
  ChatUnificationMetricEvent,
  ChatUnificationMetricInput
>({
  storageKey: STORAGE_KEY,
  storageLimit: STORAGE_LIMIT,
  metricEventName: METRIC_EVENT,
  telemetryEndpoint: TELEMETRY_ENDPOINT,
  toMetricInput,
});

export function recordChatUnificationMetric(
  event: Omit<ChatUnificationMetricEvent, "eventId" | "version" | "timestamp">,
): void {
  if (typeof window === "undefined") return;

  const normalized: ChatUnificationMetricEvent = {
    eventId: generateMetricEventId(),
    version: CHAT_UNIFICATION_METRIC_VERSION,
    timestamp: new Date().toISOString(),
    ...event,
  };

  telemetryStore.record(normalized);
}

export function getChatUnificationMetricEvents(): ChatUnificationMetricEvent[] {
  return telemetryStore.getEvents();
}

export type ChatUnificationMetricSummary = {
  /**
   * Local browser-only debug summary. Do not use for U1.6 release gates.
   * Authoritative gate metrics are computed server-side by burn-in validators.
   */
  isDebugOnly: true;
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

  const runEndByRequestKey = new Map<string, RunEndObservedPayload>();
  for (const runEndEvent of runEndEvents) {
    const payload = runEndEvent.payload as RunEndObservedPayload;
    const requestKey = getPayloadRequestKey(payload);
    if (!requestKey) continue;
    runEndByRequestKey.set(`${requestKey}|${runEndEvent.surface}`, payload);
  }

  const preserved = retryEvents.filter((event) => {
    const payload = event.payload as RetryModelContinuityPayload;
    const requestKey = getPayloadRequestKey(payload);
    if (!requestKey) {
      const legacyPayload = payloadAsRecord(payload);
      return legacyPayload?.preserved === true;
    }
    const runPayload = runEndByRequestKey.get(`${requestKey}|${event.surface}`);
    if (!runPayload) return false;
    return payload.expectedModel !== null
      && runPayload.actualModel !== null
      && payload.expectedModel === runPayload.actualModel;
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
    isDebugOnly: true,
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
  telemetryStore.clear();
}

export async function flushChatUnificationMetricsForTests(): Promise<void> {
  await telemetryStore.flushForTests();
}

export function setChatUnificationMetricShippingOverrideForTests(
  enabled: boolean | null,
): void {
  telemetryStore.setShippingOverrideForTests(enabled);
}
