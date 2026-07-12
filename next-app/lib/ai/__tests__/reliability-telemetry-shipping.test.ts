// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReliabilityMetricDraft } from "@/types/reliability-telemetry";

const originalFetch = globalThis.fetch;
const originalPublicMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE;

async function importTelemetryModule() {
  vi.resetModules();
  return await import("@/lib/ai/reliability-telemetry");
}

function makeMetric(): ReliabilityMetricDraft {
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

  it("records statically inlined public cohort flags in browser dimensions", async () => {
    vi.stubEnv("NEXT_PUBLIC_SCROLL_OWNERSHIP_A1", "1");
    vi.stubEnv("NEXT_PUBLIC_STREAM_RELIABILITY_A2", "false");
    vi.stubEnv("NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2", "on");
    const { getReliabilityDimensions } = await importTelemetryModule();

    expect(getReliabilityDimensions().flags).toEqual({
      scrollOwnershipA1: true,
      streamReliabilityA2: false,
      mobileScrollLockV2: true,
    });
  });

  it("uses exact NEXT_PUBLIC property references so Next can inline flags into the client bundle", () => {
    const source = readFileSync(path.resolve(process.cwd(), "lib/ai/reliability-telemetry.ts"), "utf8");
    expect(source).not.toContain("process.env[name]");
    expect(source).toContain("process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1");
    expect(source).toContain("process.env.NEXT_PUBLIC_STREAM_RELIABILITY_A2");
    expect(source).toContain("process.env.NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2");
  });

  it("ships the typed dead-scroll incident contract to the authoritative endpoint", async () => {
    const {
      flushReliabilityMetricsForTests,
      recordDeadScrollIncident,
      setReliabilityMetricShippingOverrideForTests,
    } = await importTelemetryModule();
    setReliabilityMetricShippingOverrideForTests(true);

    recordDeadScrollIncident("project-1", {
      sessionId: "shell-session-1",
      input: "touch",
      blockedDurationMs: 2_500,
      shellMode: "conversation",
    });
    await flushReliabilityMetricsForTests();

    const requestInit = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(requestInit?.body));
    expect(body).toMatchObject({
      type: "reliability.v1.shell.dead_scroll_detected",
      surface: "shell",
      projectId: "project-1",
      payload: {
        sessionId: "shell-session-1",
        input: "touch",
        blockedDurationMs: 2_500,
        shellMode: "conversation",
      },
    });
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
