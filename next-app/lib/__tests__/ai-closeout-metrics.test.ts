import { describe, expect, it } from "vitest";
import {
  AI_CLOSEOUT_THRESHOLDS,
  evaluateAiCloseout,
  median,
  type AiCaptureReport,
} from "../ai-closeout-metrics";

function makeReport(overrides?: Partial<AiCaptureReport>): AiCaptureReport {
  return {
    label: "head",
    commit: "abc123",
    appRoot: "/tmp/app",
    bundle: {
      chunkCount: 24,
      totalBytes: 1_000_000,
    },
    scenarios: {
      empty: {
        composerReadyMs: 500,
      },
      populated: {
        timelineReadyMs: 1_200,
        visibleItems: 80,
        hiddenItems: 80,
        totalItems: 160,
      },
    },
    ...overrides,
  };
}

describe("median", () => {
  it("returns the center value for odd-length samples", () => {
    expect(median([12, 3, 8])).toBe(8);
  });

  it("returns the rounded mean for even-length samples", () => {
    expect(median([100, 50, 70, 90])).toBe(80);
  });
});

describe("evaluateAiCloseout", () => {
  it("passes when all numeric thresholds are met", () => {
    const baseline = makeReport({ label: "baseline", commit: "base" });
    const head = makeReport({
      bundle: { chunkCount: 20, totalBytes: 930_000 },
      scenarios: {
        empty: { composerReadyMs: 420 },
        populated: {
          timelineReadyMs: 1_000,
          visibleItems: 80,
          hiddenItems: 80,
          totalItems: 160,
        },
      },
    });

    const result = evaluateAiCloseout(baseline, head);

    expect(result.bundleBytes.passed).toBe(true);
    expect(result.composerReadyMs.passed).toBe(true);
    expect(result.timelineReadyMs.passed).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("fails when a metric does not clear either threshold", () => {
    const baseline = makeReport({ label: "baseline", commit: "base" });
    const head = makeReport({
      bundle: { chunkCount: 23, totalBytes: 970_000 },
      scenarios: {
        empty: { composerReadyMs: 470 },
        populated: {
          timelineReadyMs: 1_150,
          visibleItems: 80,
          hiddenItems: 80,
          totalItems: 160,
        },
      },
    });

    const result = evaluateAiCloseout(baseline, head, {
      ...AI_CLOSEOUT_THRESHOLDS,
      bundleBytes: { minPercent: 8, minAbsolute: 100_000 },
    });

    expect(result.bundleBytes.passed).toBe(false);
    expect(result.passed).toBe(false);
  });
});
