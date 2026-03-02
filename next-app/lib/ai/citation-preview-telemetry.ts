import type {
    CitationPreviewMetricEvent,
    CitationPreviewMetricInput,
} from "@/types/citation-preview-telemetry";

const STORAGE_KEY = "litrev:citation-preview-metrics:v1";
const STORAGE_LIMIT = 2000;
const METRIC_EVENT = "litrev:citation-preview-metric";
const TELEMETRY_ENDPOINT = "/api/telemetry/citation-preview";
const FLUSH_DELAY_MS = 500;
const RETRY_DELAY_MS = 3000;
const MAX_DELIVERY_ATTEMPTS = 3;

type PendingMetric = {
    event: CitationPreviewMetricEvent;
    attempt: number;
};

let pendingMetrics: PendingMetric[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
let shippingInitialized = false;
let shippingOverrideForTests: boolean | null = null;

function generateMetricEventId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `citation-metric-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shouldShipToServer(): boolean {
    if (shippingOverrideForTests !== null) return shippingOverrideForTests;
    if (typeof window === "undefined") return false;
    if (typeof fetch !== "function") return false;
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return false;
    return true;
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

async function postMetric(event: CitationPreviewMetricEvent): Promise<void> {
    const response = await fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        keepalive: true,
        body: JSON.stringify(toMetricInput(event)),
    });

    if (!response.ok) {
        throw new Error(`Citation telemetry upload failed with status ${response.status}`);
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
            new Blob([JSON.stringify(toMetricInput(pending.event))], { type: "application/json" })
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
    if (isFlushing) {
        if (pendingMetrics.length > 0) {
            scheduleFlush();
        }
        return;
    }
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
        }
        if (pendingMetrics.length > 0) {
            scheduleFlush(retryQueue.length > 0 ? RETRY_DELAY_MS : FLUSH_DELAY_MS);
        }
    }
}

function enqueueMetricForUpload(event: CitationPreviewMetricEvent): void {
    if (!shouldShipToServer()) return;
    ensureShippingLifecycleHooks();
    pendingMetrics.push({ event, attempt: 0 });
    scheduleFlush();
}

function readEventsFromStorage(): CitationPreviewMetricEvent[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((event) => event && typeof event === "object") as CitationPreviewMetricEvent[];
    } catch {
        return [];
    }
}

export function recordCitationPreviewMetric(
    event: Omit<CitationPreviewMetricEvent, "eventId" | "version" | "timestamp">
): void {
    if (typeof window === "undefined") return;

    const normalized: CitationPreviewMetricEvent = {
        eventId: generateMetricEventId(),
        version: 1,
        timestamp: new Date().toISOString(),
        ...event,
    };

    window.dispatchEvent(new CustomEvent<CitationPreviewMetricEvent>(METRIC_EVENT, { detail: normalized }));
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

export function getCitationPreviewMetricEvents(): CitationPreviewMetricEvent[] {
    return readEventsFromStorage();
}

export function clearCitationPreviewMetrics(): void {
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

export async function flushCitationPreviewMetricsForTests(): Promise<void> {
    await flushPendingMetrics();
}

export function setCitationPreviewMetricShippingOverrideForTests(
    enabled: boolean | null
): void {
    shippingOverrideForTests = enabled;
}
