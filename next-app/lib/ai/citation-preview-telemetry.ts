import type {
  CitationPreviewMetricEvent,
  CitationPreviewMetricInput,
} from "@/types/citation-preview-telemetry";
import { createClientTelemetryStore } from "@/lib/ai/client-telemetry-store";
import { isCitationPreviewTelemetryShippingEnabled } from "@/lib/citation-preview-feature-flags";

const STORAGE_KEY = "litrev:citation-preview-metrics:v1";
const STORAGE_LIMIT = 2000;
const METRIC_EVENT = "litrev:citation-preview-metric";
const TELEMETRY_ENDPOINT = "/api/telemetry/citation-preview";

function generateMetricEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `citation-metric-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toMetricInput(event: CitationPreviewMetricEvent): CitationPreviewMetricInput {
  return {
    eventId: event.eventId,
    version: event.version,
    type: event.type,
    surface: event.surface,
    projectId: event.projectId ?? null,
    conversationId: event.conversationId ?? null,
    clientTimestamp: event.timestamp,
    payload: event.payload,
  };
}

const telemetryStore = createClientTelemetryStore<
  CitationPreviewMetricEvent,
  CitationPreviewMetricInput
>({
  storageKey: STORAGE_KEY,
  storageLimit: STORAGE_LIMIT,
  metricEventName: METRIC_EVENT,
  telemetryEndpoint: TELEMETRY_ENDPOINT,
  toMetricInput,
  canShip: isCitationPreviewTelemetryShippingEnabled,
});

export function recordCitationPreviewMetric(
  event: Omit<CitationPreviewMetricEvent, "eventId" | "version" | "timestamp">,
): void {
  if (typeof window === "undefined") return;

  const normalized: CitationPreviewMetricEvent = {
    eventId: generateMetricEventId(),
    version: 1,
    timestamp: new Date().toISOString(),
    ...event,
  };

  telemetryStore.record(normalized);
}

export function getCitationPreviewMetricEvents(): CitationPreviewMetricEvent[] {
  return telemetryStore.getEvents();
}

export function clearCitationPreviewMetrics(): void {
  telemetryStore.clear();
}

export async function flushCitationPreviewMetricsForTests(): Promise<void> {
  await telemetryStore.flushForTests();
}

export function setCitationPreviewMetricShippingOverrideForTests(
  enabled: boolean | null,
): void {
  telemetryStore.setShippingOverrideForTests(enabled);
}
