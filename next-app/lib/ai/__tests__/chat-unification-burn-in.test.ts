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
  minRetryMatchRateOverall: 1,
  minRetryMatchRatePerSurface: 1,
  minAskUserSamplesOverall: 2,
  minAskUserSamplesPerSurface: 1,
  retryContinuityRateMin: 0.9,
  askUserMismatchRateMax: 0,
  stuckRunningViolationRateMax: 0,
};

function at(
  type: ChatUnificationBurnInMetricRow["type"],
  surface: ChatUnificationBurnInMetricRow["surface"],
  payload: unknown,
  runId: string | null = null,
  version = 2,
): ChatUnificationBurnInMetricRow {
  return {
    type,
    version,
    surface,
    payload,
    runId,
    userId: "user-1",
    workspaceId: "ws-1",
    recordedAt: new Date("2026-03-02T00:00:00.000Z"),
  };
}

describe("chat unification burn-in evaluation", () => {
  it("passes when sample and quality thresholds are met", () => {
    const rows: ChatUnificationBurnInMetricRow[] = [
      at("run_end_observed", "ai", { runStatus: "completed", streamPhase: "send" }, "run-ai-1"),
      at("run_end_observed", "project", { runStatus: "completed", streamPhase: "project_stream" }, "run-prj-1"),
      at("retry_model_continuity", "ai", { requestKey: "f7b7e4ad-a620-4b6d-bf93-2d9ce2f8ff2e", expectedModel: "gpt-5.2", source: "retry_action" }),
      at("retry_model_continuity", "ai", { requestKey: "f7b7e4ad-a620-4b6d-bf93-2d9ce2f8ff2e", actualModel: "gpt-5.2", runId: "run-ai-1", runStatus: "completed", source: "run_completion" }),
      at("retry_model_continuity", "project", { requestKey: "889d119c-c2af-4ee6-a67d-c3ef98935d18", expectedModel: "claude-sonnet", source: "retry_action" }),
      at("retry_model_continuity", "project", { requestKey: "889d119c-c2af-4ee6-a67d-c3ef98935d18", actualModel: "claude-sonnet", runId: "run-prj-1", runStatus: "completed", source: "run_completion" }),
      at("ask_user_context_mismatch", "ai", { mismatch: false }),
      at("ask_user_context_mismatch", "project", { mismatch: false }),
      at("stuck_running_tools_after_run_end", "ai", { unresolvedCount: 0 }),
      at("stuck_running_tools_after_run_end", "project", { unresolvedCount: 0 }),
    ];

    const report = evaluateChatUnificationBurnIn(rows, LOW_THRESHOLDS);
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.sample.retryJoin.matchedPairs).toBe(2);
    expect(report.sample.retryJoin.unmatchedRetryIntents).toBe(0);
    expect(report.sample.retryJoin.unmatchedRunCompletions).toBe(0);
  });

  it("fails with matched-denominator errors", () => {
    const rows: ChatUnificationBurnInMetricRow[] = [
      at("run_end_observed", "ai", { runStatus: "completed", streamPhase: "send" }, "run-ai-1"),
      at("run_end_observed", "project", { runStatus: "completed", streamPhase: "project_stream" }, "run-prj-1"),
      at("retry_model_continuity", "ai", { requestKey: "f7b7e4ad-a620-4b6d-bf93-2d9ce2f8ff2e", expectedModel: "gpt-5.2", source: "retry_action" }),
      at("retry_model_continuity", "project", { requestKey: "889d119c-c2af-4ee6-a67d-c3ef98935d18", expectedModel: "claude-sonnet", source: "retry_action" }),
      at("stuck_running_tools_after_run_end", "ai", { unresolvedCount: 0 }),
      at("stuck_running_tools_after_run_end", "project", { unresolvedCount: 0 }),
      at("ask_user_context_mismatch", "ai", { mismatch: false }),
      at("ask_user_context_mismatch", "project", { mismatch: false }),
    ];

    const report = evaluateChatUnificationBurnIn(rows, LOW_THRESHOLDS);
    expect(report.passed).toBe(false);
    expect(report.failures.some((failure) => failure.includes("Retry continuity matched denominator too small"))).toBe(true);
    expect(report.failures.some((failure) => failure.includes("Retry join match-rate below threshold"))).toBe(true);
  });

  it("fails when mixed retry metric versions are present", () => {
    const rows: ChatUnificationBurnInMetricRow[] = [
      at("run_end_observed", "ai", { runStatus: "completed", streamPhase: "send" }, "run-ai-1"),
      at("run_end_observed", "project", { runStatus: "completed", streamPhase: "project_stream" }, "run-prj-1"),
      at("retry_model_continuity", "ai", {
        preserved: true,
        expectedModel: "gpt-5.2",
        actualModel: "gpt-5.2",
        source: "retry_action",
      }, null, 1),
      at("retry_model_continuity", "project", { requestKey: "889d119c-c2af-4ee6-a67d-c3ef98935d18", expectedModel: "claude-sonnet", source: "retry_action" }),
      at("retry_model_continuity", "project", { requestKey: "889d119c-c2af-4ee6-a67d-c3ef98935d18", actualModel: "claude-sonnet", runId: "run-prj-1", runStatus: "completed", source: "run_completion" }),
      at("ask_user_context_mismatch", "ai", { mismatch: false }),
      at("ask_user_context_mismatch", "project", { mismatch: false }),
      at("stuck_running_tools_after_run_end", "ai", { unresolvedCount: 0 }),
      at("stuck_running_tools_after_run_end", "project", { unresolvedCount: 0 }),
    ];

    const report = evaluateChatUnificationBurnIn(rows, LOW_THRESHOLDS);
    expect(report.passed).toBe(false);
    expect(report.failures.some((failure) => failure.includes("Mixed retry_model_continuity metric versions"))).toBe(true);
  });
});
