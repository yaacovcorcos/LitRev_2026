import type {
  AskUserContextMismatchPayload,
  ChatUnificationMetricInput,
  ChatUnificationMetricEvent,
  RunEndObservedPayload,
  RetryModelContinuityPayload,
  StuckRunningToolsPayload,
} from "@/types/chat-unification";
import { CHAT_UNIFICATION_METRIC_VERSION } from "@/types/chat-unification";

const STORAGE_KEY = `litrev:chat-unification-metrics:v${CHAT_UNIFICATION_METRIC_VERSION}`;
const STORAGE_LIMIT = 2000;
const METRIC_EVENT = "litrev:chat-unification-metric";
const TELEMETRY_ENDPOINT = "/api/telemetry/chat-unification";
const FLUSH_DELAY_MS = 500;
const RETRY_DELAY_MS = 3000;
const MAX_DELIVERY_ATTEMPTS = 3;

type PendingMetric = {
  event: ChatUnificationMetricEvent;
  attempt: number;
};

let pendingMetrics: PendingMetric[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
let shippingInitialized = false;
let shippingOverrideForTests: boolean | null = null;

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

function shouldShipToServer(): boolean {
  if (shippingOverrideForTests !== null) return shippingOverrideForTests;
  if (typeof window === "undefined") return false;
  if (typeof fetch !== "function") return false;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return false;
  }
  return true;
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

async function postMetric(event: ChatUnificationMetricEvent): Promise<void> {
  const response = await fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify(toMetricInput(event)),
  });
  if (!response.ok) {
    throw new Error(`Telemetry upload failed with status ${response.status}`);
  }
}

function scheduleFlush(delayMs = FLUSH_DELAY_MS): void {
  if (!shouldShipToServer()) return;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPendingMetrics();
  }, delayMs);
}

function flushPendingWithBeacon(): void {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
  if (pendingMetrics.length === 0) return;

  const unsent: PendingMetric[] = [];
  for (const pending of pendingMetrics) {
    const ok = navigator.sendBeacon(
      TELEMETRY_ENDPOINT,
      new Blob([JSON.stringify(toMetricInput(pending.event))], { type: "application/json" }),
    );
    if (!ok) unsent.push(pending);
  }
  pendingMetrics = unsent;
}

function ensureShippingLifecycleHooks(): void {
  if (shippingInitialized) return;
  if (typeof window === "undefined") return;
  shippingInitialized = true;

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingWithBeacon();
    }
  });

  window.addEventListener("pagehide", () => {
    flushPendingWithBeacon();
  });
}

async function flushPendingMetrics(): Promise<void> {
  if (!shouldShipToServer()) return;
  if (isFlushing) return;
  if (pendingMetrics.length === 0) return;

  isFlushing = true;
  const queue = pendingMetrics;
  pendingMetrics = [];
  const retryQueue: PendingMetric[] = [];

  try {
    for (const pending of queue) {
      try {
        await postMetric(pending.event);
      } catch {
        const nextAttempt = pending.attempt + 1;
        if (nextAttempt < MAX_DELIVERY_ATTEMPTS) {
          retryQueue.push({ event: pending.event, attempt: nextAttempt });
        }
      }
    }
  } finally {
    isFlushing = false;
    if (retryQueue.length > 0) {
      pendingMetrics = [...retryQueue, ...pendingMetrics];
      scheduleFlush(RETRY_DELAY_MS);
    }
  }
}

function enqueueMetricForUpload(event: ChatUnificationMetricEvent): void {
  if (!shouldShipToServer()) return;
  ensureShippingLifecycleHooks();
  pendingMetrics.push({ event, attempt: 0 });
  scheduleFlush();
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
    version: CHAT_UNIFICATION_METRIC_VERSION,
    timestamp: new Date().toISOString(),
    ...event,
  };

  window.dispatchEvent(new CustomEvent<ChatUnificationMetricEvent>(METRIC_EVENT, { detail: normalized }));
  enqueueMetricForUpload(normalized);

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

  const runEndByRequestKey = new Map<string, RunEndObservedPayload>();
  for (const runEndEvent of runEndEvents) {
    const payload = runEndEvent.payload as RunEndObservedPayload;
    const requestKey = getPayloadRequestKey(payload);
    if (!requestKey) continue;
    runEndByRequestKey.set(requestKey, payload);
  }

  const preserved = retryEvents.filter((event) => {
    const payload = event.payload as RetryModelContinuityPayload;
    const requestKey = getPayloadRequestKey(payload);
    if (!requestKey) {
      const legacyPayload = payloadAsRecord(payload);
      return legacyPayload?.preserved === true;
    }
    const runPayload = runEndByRequestKey.get(requestKey);
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
    pendingMetrics = [];
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  } catch {
    // Best-effort cleanup only.
  }
}

export async function flushChatUnificationMetricsForTests(): Promise<void> {
  await flushPendingMetrics();
}

export function setChatUnificationMetricShippingOverrideForTests(
  enabled: boolean | null,
): void {
  shippingOverrideForTests = enabled;
}
