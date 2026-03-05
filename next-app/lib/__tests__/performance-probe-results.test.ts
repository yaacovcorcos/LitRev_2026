import { describe, expect, it } from "vitest";

import {
  buildProbeResultsArtifact,
  findCoverageIssues,
  percentile75,
  type ProbeSample,
} from "@/lib/performance-probe-results";

function makeSample(overrides: Partial<ProbeSample> = {}): ProbeSample {
  return {
    routeTemplate: "/project/[id]",
    profile: "desktop-normal",
    metrics: {
      LCP: 2000,
      INP: 180,
      CLS: 0.05,
      TTFB: 500,
    },
    ...overrides,
  };
}

describe("performance-probe-results", () => {
  it("computes p75 using nearest-rank semantics", () => {
    expect(percentile75([100, 200, 300, 400])).toBe(300);
    expect(percentile75([100, 200, 300, 400, 500, 600, 700, 800, 900])).toBe(700);
  });

  it("aggregates route/profile samples into a results artifact", () => {
    const samples = [
      makeSample({ metrics: { LCP: 1900, INP: 150, CLS: 0.04, TTFB: 450 } }),
      makeSample({ metrics: { LCP: 2100, INP: 170, CLS: 0.05, TTFB: 470 } }),
      makeSample({ metrics: { LCP: 2200, INP: 190, CLS: 0.08, TTFB: 510 } }),
      makeSample({ metrics: { LCP: 2300, INP: 210, CLS: 0.09, TTFB: 530 } }),
      makeSample({ metrics: { LCP: 2400, INP: 220, CLS: 0.1, TTFB: 560 } }),
      makeSample({ metrics: { LCP: 2500, INP: 230, CLS: 0.11, TTFB: 580 } }),
      makeSample({ metrics: { LCP: 2600, INP: 240, CLS: 0.12, TTFB: 600 } }),
      makeSample({ metrics: { LCP: 2700, INP: 250, CLS: 0.13, TTFB: 640 } }),
      makeSample({ metrics: { LCP: 2800, INP: 260, CLS: 0.14, TTFB: 680 } }),
    ];

    const artifact = buildProbeResultsArtifact({
      capturedAt: "2026-03-06T10:00:00.000Z",
      commit: "abc123",
      source: "ci-probe-playwright",
      runId: "run-1",
      samples,
    });

    expect(artifact).toEqual({
      capturedAt: "2026-03-06T10:00:00.000Z",
      commit: "abc123",
      source: "ci-probe-playwright",
      runId: "run-1",
      metadata: {
        sampleCount: 9,
        routeProfileSampleCounts: {
          "/project/[id]:desktop-normal": 9,
        },
      },
      routes: {
        "/project/[id]": {
          "desktop-normal": {
            samples: 9,
            p75: {
              LCP: 2600,
              INP: 240,
              CLS: 0.12,
              TTFB: 600,
            },
          },
        },
      },
    });
  });

  it("reports missing and insufficient coverage for required route/profile pairs", () => {
    const artifact = buildProbeResultsArtifact({
      capturedAt: "2026-03-06T10:00:00.000Z",
      commit: "abc123",
      source: "ci-probe-playwright",
      runId: "run-1",
      samples: [
        makeSample(),
        makeSample({ profile: "mobile-mid", routeTemplate: "/ai" }),
      ],
    });

    expect(
      findCoverageIssues({
        results: artifact,
        mandatoryRoutes: ["/project/[id]", "/ai"],
        mandatoryProfiles: ["desktop-normal", "mobile-mid"],
        minSamples: 2,
      }),
    ).toEqual([
      "[insufficient-sample] /project/[id] desktop-normal: samples=1, required=2",
      "[missing-route-profile] /project/[id] mobile-mid",
      "[missing-route-profile] /ai desktop-normal",
      "[insufficient-sample] /ai mobile-mid: samples=1, required=2",
    ]);
  });
});
