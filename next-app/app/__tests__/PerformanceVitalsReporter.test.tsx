// @vitest-environment jsdom

import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOperationalTelemetryBackoffForTests } from "@/lib/telemetry/client-operational-backoff";

type ReportedMetric = {
  id: string;
  name: string;
  rating: string;
  value: number;
};

const reporterMocks = vi.hoisted(() => ({
  callback: null as ((metric: ReportedMetric) => void) | null,
}));

vi.mock("next/web-vitals", () => ({
  useReportWebVitals: (callback: (metric: ReportedMetric) => void) => {
    reporterMocks.callback = callback;
  },
}));

const { PerformanceVitalsReporter } = await import("@/app/PerformanceVitalsReporter");

describe("PerformanceVitalsReporter", () => {
  beforeEach(() => {
    resetOperationalTelemetryBackoffForTests();
    reporterMocks.callback = null;
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetOperationalTelemetryBackoffForTests();
  });

  it("silently suppresses additional metrics while telemetry is in failure cooldown", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    render(<PerformanceVitalsReporter />);
    if (!reporterMocks.callback) throw new Error("Web Vitals callback was not registered");

    await act(async () => {
      reporterMocks.callback?.({ id: "lcp-1", name: "LCP", rating: "poor", value: 3_000 });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      reporterMocks.callback?.({ id: "cls-1", name: "CLS", rating: "poor", value: 0.2 });
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
