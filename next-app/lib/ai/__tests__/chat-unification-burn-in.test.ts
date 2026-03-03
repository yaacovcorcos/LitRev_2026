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
  minRetryMatchedOverall: 2,
  minRetryMatchedPerSurface: 1,
  minRetryEligibleOverall: 2,
  minRetryEligiblePerSurface: 1,
  minAskUserSamplesOverall: 2,
  minAskUserSamplesPerSurface: 1,
  retryContinuityRateMin: 0.9,
  retryMatchRateMin: 0.9,
  retryMatchRateMinPerSurface: 0.9,
  askUserMismatchRateMax: 0,
  stuckRunningViolationRateMax: 0,
  retryJoinWindowMinutes: 30,
};

function at(type: ChatUnificationBurnInMetricRow["type"], surface: ChatUnificationBurnInMetricRow["surface"], payload: unknown, runId: string | null = null): ChatUnificationBurnInMetricRow {
  return {
    version: 3,
    type,
    surface,
    userId: "user-1",
    workspaceId: "ws-1",
    payload,
    runId,
    recordedAt: new Date("2026-03-02T00:00:00.000Z"),
  };
}

describe("chat unification burn-in evaluation", () => {
  it("passes when sample and quality thresholds are met", () => {
    const rows: ChatUnificationBurnInMetricRow[] = [
      at("run_end_observed", "ai", { requestKey: "c1840f42-ed6d-4438-8a7b-769f8a6faaf6", runStatus: "completed", streamPhase: "send", actualModel: "gpt-5.2" }, "run-ai-1"),
      at("run_end_observed", "project", { requestKey: "35f5ce02-c3e7-4f24-b4e0-c8f29d8fc16e", runStatus: "completed", streamPhase: "project_stream", actualModel: "gpt-5.2" }, "run-prj-1"),
      at("retry_model_continuity", "ai", { requestKey: "c1840f42-ed6d-4438-8a7b-769f8a6faaf6", expectedModel: "gpt-5.2", source: "retry_action" }),
      at("retry_model_continuity", "project", { requestKey: "35f5ce02-c3e7-4f24-b4e0-c8f29d8fc16e", expectedModel: "gpt-5.2", source: "retry_action" }),
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
    expect(report.failures.some((failure) => failure.includes("Retry continuity denominator too small") || failure.includes("Retry matched sample too small"))).toBe(true);
    expect(report.failures.some((failure) => failure.includes("Ask-user denominator too small"))).toBe(true);
  });

  it("fails when mismatch and stuck-violation rates exceed thresholds", () => {
    const rows: ChatUnificationBurnInMetricRow[] = [
      at("run_end_observed", "ai", { requestKey: "95f74322-8f56-439d-a335-2553a0e6ee0f", runStatus: "completed", streamPhase: "send", actualModel: "gpt-5.2" }, "run-ai-1"),
      at("run_end_observed", "project", { requestKey: "9e61a924-c967-472a-956b-f3fa33195fba", runStatus: "completed", streamPhase: "project_stream", actualModel: "gpt-5.2" }, "run-prj-1"),
      at("retry_model_continuity", "ai", { requestKey: "95f74322-8f56-439d-a335-2553a0e6ee0f", expectedModel: "gpt-5.2", source: "retry_action" }),
      at("retry_model_continuity", "project", { requestKey: "9e61a924-c967-472a-956b-f3fa33195fba", expectedModel: "gpt-5.2", source: "retry_action" }),
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

  it("uses unresolvedCountBeforeClear as stuck-tool gate truth with legacy fallback", () => {
    const rows: ChatUnificationBurnInMetricRow[] = [
      at("run_end_observed", "ai", { runStatus: "completed", streamPhase: "send" }, "run-ai-1"),
      at("run_end_observed", "project", { runStatus: "completed", streamPhase: "project_stream" }, "run-prj-1"),
      at("retry_model_continuity", "ai", { preserved: true }),
      at("retry_model_continuity", "project", { preserved: true }),
      at("ask_user_context_mismatch", "ai", { mismatch: false }),
      at("ask_user_context_mismatch", "project", { mismatch: false }),
      at("stuck_running_tools_after_run_end", "ai", {
        unresolvedCount: 0,
        unresolvedCountBeforeClear: 1,
        unresolvedCountAfterClear: 0,
      }),
      at("stuck_running_tools_after_run_end", "project", {
        unresolvedCount: 1,
      }),
    ];

    const report = evaluateChatUnificationBurnIn(rows, LOW_THRESHOLDS);
    expect(report.stuckRunningToolsAfterRunEnd.violations).toBe(2);
    expect(report.stuckRunningToolsAfterRunEnd.preClearViolations).toBe(1);
    expect(report.stuckRunningToolsAfterRunEnd.postClearViolations).toBe(0);
    expect(report.stuckRunningToolsAfterRunEnd.legacyFallbackViolations).toBe(1);
  });
});
