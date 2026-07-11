import {
  canAttemptOperationalTelemetry,
  getOperationalTelemetryRetryDelayMs,
  noteOperationalTelemetryFailure,
} from "@/lib/telemetry/client-operational-backoff";

type PendingMetric<TEvent> = {
  event: TEvent;
  attempt: number;
};

type ClientTelemetryStoreOptions<TEvent, TInput> = {
  storageKey: string;
  storageLimit: number;
  metricEventName: string;
  telemetryEndpoint: string;
  toMetricInput: (event: TEvent) => TInput;
  canShip?: () => boolean;
  flushDelayMs?: number;
  retryDelayMs?: number;
  maxDeliveryAttempts?: number;
  failureCooldownMs?: number;
};

type ClientTelemetryStore<TEvent> = {
  clear: () => void;
  flushForTests: () => Promise<void>;
  getEvents: () => TEvent[];
  record: (event: TEvent) => void;
  setShippingOverrideForTests: (enabled: boolean | null) => void;
};

const DEFAULT_FLUSH_DELAY_MS = 500;
const DEFAULT_RETRY_DELAY_MS = 3000;
const DEFAULT_MAX_DELIVERY_ATTEMPTS = 3;
const DEFAULT_FAILURE_COOLDOWN_MS = 30_000;

export function createClientTelemetryStore<TEvent extends object, TInput>({
  storageKey,
  storageLimit,
  metricEventName,
  telemetryEndpoint,
  toMetricInput,
  canShip,
  flushDelayMs = DEFAULT_FLUSH_DELAY_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  maxDeliveryAttempts = DEFAULT_MAX_DELIVERY_ATTEMPTS,
  failureCooldownMs = DEFAULT_FAILURE_COOLDOWN_MS,
}: ClientTelemetryStoreOptions<TEvent, TInput>): ClientTelemetryStore<TEvent> {
  let pendingMetrics: PendingMetric<TEvent>[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let isFlushing = false;
  let shippingInitialized = false;
  let shippingOverrideForTests: boolean | null = null;

  function hasShippingTransport(): boolean {
    if (shippingOverrideForTests !== null) return shippingOverrideForTests;
    if (typeof window === "undefined") return false;
    if (typeof fetch !== "function") return false;
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
      return false;
    }
    if (canShip && !canShip()) return false;
    return true;
  }

  async function postMetric(event: TEvent): Promise<void> {
    try {
      const response = await fetch(telemetryEndpoint, {
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
    } catch (error) {
      noteOperationalTelemetryFailure(Date.now(), failureCooldownMs);
      throw error;
    }
  }

  function scheduleFlush(delayMs = flushDelayMs): void {
    if (!hasShippingTransport()) return;
    if (flushTimer) return;
    const backoffDelayMs = getOperationalTelemetryRetryDelayMs();
    const effectiveDelayMs = Math.max(delayMs, backoffDelayMs);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushPendingMetrics();
    }, effectiveDelayMs);
  }

  function flushPendingWithBeacon(): void {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
    if (pendingMetrics.length === 0) return;

    const unsent: PendingMetric<TEvent>[] = [];
    for (const pending of pendingMetrics) {
      const ok = navigator.sendBeacon(
        telemetryEndpoint,
        new Blob([JSON.stringify(toMetricInput(pending.event))], {
          type: "application/json",
        }),
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
    if (!hasShippingTransport()) return;
    if (!canAttemptOperationalTelemetry()) {
      scheduleFlush(getOperationalTelemetryRetryDelayMs());
      return;
    }
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
    const retryQueue: PendingMetric<TEvent>[] = [];

    try {
      for (let index = 0; index < queue.length; index += 1) {
        const pending = queue[index]!;
        try {
          await postMetric(pending.event);
        } catch {
          const nextAttempt = pending.attempt + 1;
          if (nextAttempt < maxDeliveryAttempts) {
            retryQueue.push({ event: pending.event, attempt: nextAttempt });
          }
          retryQueue.push(...queue.slice(index + 1));
          break;
        }
      }
    } finally {
      isFlushing = false;
      if (retryQueue.length > 0) {
        pendingMetrics = [...retryQueue, ...pendingMetrics];
      }
      if (pendingMetrics.length > 0) {
        scheduleFlush(retryQueue.length > 0 ? retryDelayMs : flushDelayMs);
      }
    }
  }

  function enqueueMetricForUpload(event: TEvent): void {
    if (!hasShippingTransport()) return;
    ensureShippingLifecycleHooks();
    pendingMetrics.push({ event, attempt: 0 });
    scheduleFlush();
  }

  function getEvents(): TEvent[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((event) => event && typeof event === "object") as TEvent[];
    } catch {
      return [];
    }
  }

  function persistEvent(event: TEvent): void {
    if (typeof window === "undefined") return;
    try {
      const existing = getEvents();
      const next = [...existing, event];
      const bounded =
        next.length > storageLimit ? next.slice(next.length - storageLimit) : next;
      window.localStorage.setItem(storageKey, JSON.stringify(bounded));
    } catch {
      // Best-effort telemetry only.
    }
  }

  return {
    clear() {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Best-effort cleanup only.
        }
      }

      pendingMetrics = [];
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    },
    async flushForTests() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flushPendingMetrics();
    },
    getEvents,
    record(event) {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent<TEvent>(metricEventName, { detail: event }));
      enqueueMetricForUpload(event);
      persistEvent(event);
    },
    setShippingOverrideForTests(enabled) {
      shippingOverrideForTests = enabled;
    },
  };
}
