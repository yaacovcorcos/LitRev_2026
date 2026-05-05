import { describe, expect, it } from "vitest";
import {
  REQUIRED_RUNTIME_FIXTURE_SIGNALS,
  evaluateAgentQualityGate,
} from "@/lib/server/evals/agent-quality-gate";
import { DEFAULT_BURN_IN_THRESHOLDS } from "@/lib/ai/chat-unification-burn-in";
import { CHAT_STREAM_FIXTURES_V1 } from "@/lib/ai/stream-fixtures";

describe("agent quality gate", () => {
  it("passes the default deterministic eval, fixture, and burn-in contract", () => {
    const report = evaluateAgentQualityGate();

    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
    for (const signal of REQUIRED_RUNTIME_FIXTURE_SIGNALS) {
      expect(report.observedRuntimeSignals).toContain(signal);
    }
  });

  it("fails when runtime-observable scenario signals lose fixture coverage", () => {
    const report = evaluateAgentQualityGate({
      fixtures: CHAT_STREAM_FIXTURES_V1.filter((fixture) => fixture.id !== "openalex-receipt-trace"),
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toContain("scenario-runtime-signal-fixtures: tool_activity:search_openalex");
    expect(report.failures).toContain("runtime-fixture-coverage: tool_activity:search_openalex");
  });

  it("fails if strict burn-in thresholds are weakened", () => {
    const report = evaluateAgentQualityGate({
      burnInThresholds: {
        ...DEFAULT_BURN_IN_THRESHOLDS,
        retryContinuityRateMin: 0.5,
        askUserMismatchRateMax: 0.1,
      },
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toContain("burn-in-threshold-floor: retryContinuityRateMin: 0.5 < 0.99");
    expect(report.failures).toContain("burn-in-threshold-floor: askUserMismatchRateMax: 0.1 !== 0");
  });

  it("fails unknown scenario signal names instead of silently accepting typos", () => {
    const report = evaluateAgentQualityGate({
      scenarios: [
        {
          id: "bad-signal",
          suite: "runtime",
          title: "Bad signal",
          prompt: "Exercise a typo.",
          expectedSignals: ["run-end-completed"],
        },
      ],
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toContain("scenario-signal-vocabulary: run-end-completed");
  });
});
