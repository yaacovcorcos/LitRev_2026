// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReliabilityMetricEvent } from "@/types/reliability-telemetry";

const originalFetch = globalThis.fetch;
const originalPublicMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE;

async function importTelemetryModule() {
  vi.resetModules();
  return await import("@/lib/ai/reliability-telemetry");
}

function makeMetric(): Omit<
  ReliabilityMetricEvent,
  "eventId" | "version" | "timestamp" | "dimensions"
> {
  return {
    type: "reliability.v1.route.ready" as const,
    surface: "home" as const,
    payload: {
      routeTemplate: "/" as const,
      state: "workspace" as const,
      layoutMode: null,
    },
  };
}

describe("reliability telemetry shipping", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
    } as Response);
    window.localStorage.clear();
    delete process.env.NEXT_PUBLIC_E2E_TEST_MODE;
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_E2E_TEST_MODE = originalPublicMode;
    vi.unstubAllEnvs();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("ships reliability metrics by default when fetch is available", async () => {
    const {
      flushReliabilityMetricsForTests,
      recordReliabilityMetric,
      setReliabilityMetricShippingOverrideForTests,
    } = await importTelemetryModule();

    setReliabilityMetricShippingOverrideForTests(true);

    recordReliabilityMetric(makeMetric());

    await flushReliabilityMetricsForTests();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[0]).toBe("/api/telemetry/reliability");
  });

  it("does not ship reliability metrics in explicit E2E mode", async () => {
    process.env.NEXT_PUBLIC_E2E_TEST_MODE = "1";
    const {
      flushReliabilityMetricsForTests,
      recordReliabilityMetric,
      setReliabilityMetricShippingOverrideForTests,
    } = await importTelemetryModule();

    setReliabilityMetricShippingOverrideForTests(null);

    recordReliabilityMetric(makeMetric());

    await flushReliabilityMetricsForTests();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])(
    "keeps reliability shipping best-effort when the server responds with %s",
    async (status) => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
      } as Response);

      const {
        clearReliabilityMetrics,
        flushReliabilityMetricsForTests,
        getReliabilityMetricEvents,
        recordReliabilityMetric,
        setReliabilityMetricShippingOverrideForTests,
      } = await importTelemetryModule();

      clearReliabilityMetrics();
      setReliabilityMetricShippingOverrideForTests(true);

      expect(() => {
        recordReliabilityMetric(makeMetric());
      }).not.toThrow();

      await expect(flushReliabilityMetricsForTests()).resolves.toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalled();
      expect(getReliabilityMetricEvents()).toHaveLength(1);
    },
  );
});
