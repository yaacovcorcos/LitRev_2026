// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClientTelemetryStore } from "@/lib/ai/client-telemetry-store";
import { resetOperationalTelemetryBackoffForTests } from "@/lib/telemetry/client-operational-backoff";

describe("client telemetry failure backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetOperationalTelemetryBackoffForTests();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetOperationalTelemetryBackoffForTests();
  });

  it("stops fan-out after one failed request and resumes the queue after cooldown", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValue({ ok: true, status: 202 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const store = createClientTelemetryStore<{ id: string }, { id: string }>({
      storageKey: "telemetry-backoff-test",
      storageLimit: 10,
      metricEventName: "telemetry-backoff-test",
      telemetryEndpoint: "/api/telemetry/test",
      toMetricInput: (event) => event,
      flushDelayMs: 0,
      retryDelayMs: 10,
      failureCooldownMs: 1_000,
    });
    store.setShippingOverrideForTests(true);

    store.record({ id: "first" });
    store.record({ id: "second" });
    await store.flushForTests();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
