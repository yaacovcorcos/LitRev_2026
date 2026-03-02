import { describe, expect, it } from "vitest";
import {
  evaluateChatUnificationBurnIn,
  type BurnInThresholds,
  type ChatUnificationBurnInMetricRow,
} from "@/lib/ai/chat-unification-burn-in";

const LOW_THRESHOLDS: BurnInThresholds = {
  minCompletedRuns: 2,
  minCompletedRunsPerSurface: 1,
  minRetrySamplesOverall: 2,
  minRetrySamplesPerSurface: 1,
  minAskUserSamplesOverall: 2,
  minAskUserSamplesPerSurface: 1,
  retryContinuityRateMin: 0.9,
  askUserMismatchRateMax: 0,
  stuckRunningViolationRateMax: 0,
};

function at(type: ChatUnificationBurnInMetricRow["type"], surface: ChatUnificationBurnInMetricRow["surface"], payload: unknown, runId: string | null = null): ChatUnificationBurnInMetricRow {
  return {
    type,
    surface,
    payload,
    runId,
    recordedAt: new Date("2026-03-02T00:00:00.000Z"),
  };
}

describe("chat unification burn-in evaluation", () => {
  it("passes when sample and quality thresholds are met", () => {
    const rows: ChatUnificationBurnInMetricRow[] = [
      at("run_end_observed", "ai", { runStatus: "completed", streamPhase: "send" }, "run-ai-1"),
      at("run_end_observed", "project", { runStatus: "completed", streamPhase: "project_stream" }, "run-prj-1"),
      at("retry_model_continuity", "ai", { preserved: true }),
      at("retry_model_continuity", "project", { preserved: true }),
      at("ask_user_context_mismatch", "ai", { mismatch: false }),
      at("ask_user_context_mismatch", "project", { mismatch: false }),
      at("stuck_running_tools_after_run_end", "ai", { unresolvedCount: 0 }),
      at("stuck_running_tools_after_run_end", "project", { unresolvedCount: 0 }),
    ];

    const report = evaluateChatUnificationBurnIn(rows, LOW_THRESHOLDS);
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it("fails with non-vacuous denominator errors", () => {
    const rows: ChatUnificationBurnInMetricRow[] = [
      at("run_end_observed", "ai", { runStatus: "completed", streamPhase: "send" }, "run-ai-1"),
      at("run_end_observed", "project", { runStatus: "completed", streamPhase: "project_stream" }, "run-prj-1"),
      at("stuck_running_tools_after_run_end", "ai", { unresolvedCount: 0 }),
      at("stuck_running_tools_after_run_end", "project", { unresolvedCount: 0 }),
    ];

    const report = evaluateChatUnificationBurnIn(rows, LOW_THRESHOLDS);
    expect(report.passed).toBe(false);
    expect(report.failures.some((failure) => failure.includes("Retry continuity denominator too small"))).toBe(true);
    expect(report.failures.some((failure) => failure.includes("Ask-user denominator too small"))).toBe(true);
  });

  it("fails when mismatch and stuck-violation rates exceed thresholds", () => {
    const rows: ChatUnificationBurnInMetricRow[] = [
      at("run_end_observed", "ai", { runStatus: "completed", streamPhase: "send" }, "run-ai-1"),
      at("run_end_observed", "project", { runStatus: "completed", streamPhase: "project_stream" }, "run-prj-1"),
      at("retry_model_continuity", "ai", { preserved: true }),
      at("retry_model_continuity", "project", { preserved: true }),
      at("ask_user_context_mismatch", "ai", { mismatch: true }),
      at("ask_user_context_mismatch", "project", { mismatch: false }),
      at("stuck_running_tools_after_run_end", "ai", { unresolvedCount: 1 }),
      at("stuck_running_tools_after_run_end", "project", { unresolvedCount: 0 }),
    ];

    const report = evaluateChatUnificationBurnIn(rows, LOW_THRESHOLDS);
    expect(report.passed).toBe(false);
    expect(report.failures.some((failure) => failure.includes("Ask-user mismatch above threshold"))).toBe(true);
    expect(report.failures.some((failure) => failure.includes("Stuck-running violations above threshold"))).toBe(true);
  });
});
