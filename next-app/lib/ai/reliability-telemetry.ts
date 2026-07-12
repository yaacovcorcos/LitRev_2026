import { createClientTelemetryStore } from "@/lib/ai/client-telemetry-store";
import { getViewportClass } from "@/lib/mobile/tiers";
import { isOperationalTelemetryE2EMode } from "@/lib/telemetry/e2e-mode";
import {
  RELIABILITY_METRIC_VERSION,
  type ReliabilityDimensions,
  type ReliabilityMetricDraft,
  type ReliabilityMetricEvent,
  type ReliabilityMetricInput,
  type ReliabilityMetricPayloadByType,
} from "@/types/reliability-telemetry";

const STORAGE_KEY = `litrev:reliability-metrics:v${RELIABILITY_METRIC_VERSION}`;
const STORAGE_LIMIT = 2000;
const METRIC_EVENT = "litrev:reliability-metric";
const TELEMETRY_ENDPOINT = "/api/telemetry/reliability";

function readFlag(raw: string | undefined): boolean | null {
  if (raw == null) return null;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function getReliabilityDimensions(): ReliabilityDimensions {
  let viewport: ReliabilityDimensions["viewport"] = "unknown";
  let network: ReliabilityDimensions["network"] = "unknown";

  if (typeof window !== "undefined") {
    viewport = getViewportClass(window);
    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      network = navigator.onLine ? "online" : "offline";
    }
  }

  return {
    viewport,
    network,
    flags: {
      scrollOwnershipA1: readFlag(process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1),
      streamReliabilityA2: readFlag(process.env.NEXT_PUBLIC_STREAM_RELIABILITY_A2),
      mobileScrollLockV2: readFlag(process.env.NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2),
    },
  };
}

function canShipReliabilityMetrics(): boolean {
  if (isOperationalTelemetryE2EMode()) return false;
  return true;
}

function toMetricInput(event: ReliabilityMetricEvent): ReliabilityMetricInput {
  if (event.type === "reliability.v1.shell.dead_scroll_detected") {
    const { timestamp, ...metric } = event;
    return {
      ...metric,
      conversationId: metric.conversationId ?? null,
      runId: metric.runId ?? null,
      clientTimestamp: timestamp,
    };
  }

  const { timestamp, ...metric } = event;
  return {
    ...metric,
    projectId: metric.projectId ?? null,
    conversationId: metric.conversationId ?? null,
    runId: metric.runId ?? null,
    clientTimestamp: timestamp,
  };
}

const telemetryStore = createClientTelemetryStore<
  ReliabilityMetricEvent,
  ReliabilityMetricInput
>({
  storageKey: STORAGE_KEY,
  storageLimit: STORAGE_LIMIT,
  metricEventName: METRIC_EVENT,
  telemetryEndpoint: TELEMETRY_ENDPOINT,
  toMetricInput,
  canShip: canShipReliabilityMetrics,
});

function generateMetricEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `reliability-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recordReliabilityMetric(
  event: ReliabilityMetricDraft,
): void {
  if (typeof window === "undefined") return;

  const normalized: ReliabilityMetricEvent = {
    eventId: generateMetricEventId(),
    version: RELIABILITY_METRIC_VERSION,
    timestamp: new Date().toISOString(),
    dimensions: getReliabilityDimensions(),
    ...event,
  };

  telemetryStore.record(normalized);
}

export function recordDeadScrollIncident(
  projectId: string,
  payload: ReliabilityMetricPayloadByType["reliability.v1.shell.dead_scroll_detected"],
): void {
  recordReliabilityMetric({
    type: "reliability.v1.shell.dead_scroll_detected",
    surface: "shell",
    projectId,
    payload,
  });
}

export function getReliabilityMetricEvents(): ReliabilityMetricEvent[] {
  return telemetryStore.getEvents();
}

export function clearReliabilityMetrics(): void {
  telemetryStore.clear();
}

export async function flushReliabilityMetricsForTests(): Promise<void> {
  await telemetryStore.flushForTests();
}

export function setReliabilityMetricShippingOverrideForTests(enabled: boolean | null): void {
  telemetryStore.setShippingOverrideForTests(enabled);
}
