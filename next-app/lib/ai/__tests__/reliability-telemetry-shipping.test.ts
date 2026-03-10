// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;
const originalPublicMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE;

async function importTelemetryModule() {
  vi.resetModules();
  return await import("@/lib/ai/reliability-telemetry");
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
    const { recordReliabilityMetric } = await importTelemetryModule();

    recordReliabilityMetric({
      type: "reliability.v1.route.ready",
      surface: "home",
      payload: {
        routeTemplate: "/",
        state: "workspace",
        layoutMode: null,
      },
    });

    await Promise.resolve();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[0]).toBe("/api/telemetry/reliability");
  });

  it("does not ship reliability metrics in explicit E2E mode", async () => {
    process.env.NEXT_PUBLIC_E2E_TEST_MODE = "1";
    const { recordReliabilityMetric } = await importTelemetryModule();

    recordReliabilityMetric({
      type: "reliability.v1.route.ready",
      surface: "home",
      payload: {
        routeTemplate: "/",
        state: "workspace",
        layoutMode: null,
      },
    });

    await Promise.resolve();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
