import type { ContextCaptureMetricEvent, ContextCaptureMetricInput } from "@/types/context-capture-telemetry";
import { CONTEXT_CAPTURE_METRIC_VERSION } from "@/types/context-capture-telemetry";

const STORAGE_KEY = `litrev:context-capture-metrics:v${CONTEXT_CAPTURE_METRIC_VERSION}`;
const STORAGE_LIMIT = 500;
const TELEMETRY_ENDPOINT = "/api/telemetry/context-capture";

function shouldShipToServer(): boolean {
    if (typeof window === "undefined") return false;
    if (typeof fetch !== "function") return false;
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return false;
    return true;
}

function toMetricInput(event: ContextCaptureMetricEvent): ContextCaptureMetricInput {
    return {
        eventId: event.eventId,
        version: event.version,
        type: event.type,
        projectId: event.projectId,
        clientTimestamp: event.timestamp,
        payload: event.payload,
    };
}

async function postMetric(event: ContextCaptureMetricEvent): Promise<void> {
    const response = await fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        keepalive: true,
        body: JSON.stringify(toMetricInput(event)),
    });

    if (!response.ok) {
        throw new Error(`Context capture telemetry upload failed with status ${response.status}`);
    }
}

function readEventsFromStorage(): ContextCaptureMetricEvent[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((event) => event && typeof event === "object") as ContextCaptureMetricEvent[];
    } catch {
        return [];
    }
}

export function recordContextCaptureMetric(
    event: Omit<ContextCaptureMetricEvent, "eventId" | "version" | "timestamp">,
): void {
    if (typeof window === "undefined") return;

    const normalized: ContextCaptureMetricEvent = {
        eventId: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `context-capture-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        version: CONTEXT_CAPTURE_METRIC_VERSION,
        timestamp: new Date().toISOString(),
        ...event,
    };

    if (shouldShipToServer()) {
        void postMetric(normalized).catch(() => {
            // Best-effort telemetry only.
        });
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

export function clearContextCaptureMetrics(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Best-effort cleanup only.
    }
}

