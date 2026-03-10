import {
  RELIABILITY_METRIC_VERSION,
  type ReliabilityDimensions,
  type ReliabilityMetricEvent,
  type ReliabilityMetricInput,
} from "@/types/reliability-telemetry";
import { getViewportClass } from "@/lib/mobile/tiers";
import { isOperationalTelemetryE2EMode } from "@/lib/telemetry/e2e-mode";

const STORAGE_KEY = `litrev:reliability-metrics:v${RELIABILITY_METRIC_VERSION}`;
const STORAGE_LIMIT = 2000;
const TELEMETRY_ENDPOINT = "/api/telemetry/reliability";

function readFlag(name: string): boolean | null {
  const raw = process.env[name];
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
      scrollOwnershipA1: readFlag("NEXT_PUBLIC_SCROLL_OWNERSHIP_A1"),
      streamReliabilityA2: readFlag("NEXT_PUBLIC_STREAM_RELIABILITY_A2"),
      mobileScrollLockV2: readFlag("NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2"),
    },
  };
}

function shouldShipToServer(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof fetch !== "function") return false;
  if (isOperationalTelemetryE2EMode()) return false;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return false;
  return true;
}

function toMetricInput(event: ReliabilityMetricEvent): ReliabilityMetricInput {
  return {
    eventId: event.eventId,
    version: event.version,
    type: event.type,
    surface: event.surface,
    projectId: event.projectId ?? null,
    conversationId: event.conversationId ?? null,
    runId: event.runId ?? null,
    clientTimestamp: event.timestamp,
    dimensions: event.dimensions,
    payload: event.payload,
  };
}

async function postMetric(event: ReliabilityMetricEvent): Promise<void> {
  const response = await fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify(toMetricInput(event)),
  });

  if (!response.ok) {
    throw new Error(`Reliability telemetry upload failed with status ${response.status}`);
  }
}

function readEventsFromStorage(): ReliabilityMetricEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((event) => event && typeof event === "object") as ReliabilityMetricEvent[];
  } catch {
    return [];
  }
}

export function recordReliabilityMetric(
  event: Omit<ReliabilityMetricEvent, "eventId" | "version" | "timestamp" | "dimensions">,
): void {
  if (typeof window === "undefined") return;

  const normalized: ReliabilityMetricEvent = {
    eventId: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `reliability-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    version: RELIABILITY_METRIC_VERSION,
    timestamp: new Date().toISOString(),
    dimensions: getReliabilityDimensions(),
    ...event,
  };

  if (shouldShipToServer()) {
    void postMetric(normalized);
  }

  try {
    const existing = readEventsFromStorage();
    const next = [...existing, normalized];
    const bounded = next.length > STORAGE_LIMIT ? next.slice(next.length - STORAGE_LIMIT) : next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Best-effort telemetry only.
  }
}

export function clearReliabilityMetrics(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort cleanup only.
  }
}
