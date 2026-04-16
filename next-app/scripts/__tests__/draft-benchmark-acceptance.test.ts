import sampleBaseline from "../../test/fixtures/draft/measurements/sample-baseline.json";
import { describe, expect, it } from "vitest";
import { evaluateDraftBenchmarkMeasurements, summarizeDraftBenchmarkGate, type DraftBenchmarkMeasurement } from "@/lib/draft-benchmark/harness";

describe("draft benchmark acceptance", () => {
  it("passes the sample baseline measurements", () => {
    const gate = summarizeDraftBenchmarkGate(
      evaluateDraftBenchmarkMeasurements(sampleBaseline.measurements as DraftBenchmarkMeasurement[]),
    );
    expect(gate.passed).toBe(true);
    expect(gate.blockingFailures).toHaveLength(0);
  });
});
