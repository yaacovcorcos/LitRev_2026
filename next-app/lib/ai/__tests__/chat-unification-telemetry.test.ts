// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearChatUnificationMetrics,
  getChatUnificationMetricEvents,
  recordChatUnificationMetric,
  summarizeChatUnificationMetrics,
} from "@/lib/ai/chat-unification-telemetry";

describe("chat unification telemetry", () => {
  beforeEach(() => {
    clearChatUnificationMetrics();
  });

  it("records events and computes summary rates", () => {
    recordChatUnificationMetric({
      type: "retry_model_continuity",
      surface: "ai",
      payload: {
        expectedModel: "gpt-5.2",
        requestKey: "f7b7e4ad-a620-4b6d-bf93-2d9ce2f8ff2e",
        source: "retry_action",
      },
    });

    recordChatUnificationMetric({
      type: "retry_model_continuity",
      surface: "project",
      payload: {
        actualModel: "claude-sonnet",
        requestKey: "889d119c-c2af-4ee6-a67d-c3ef98935d18",
        runId: "run-1",
        runStatus: "completed",
        source: "run_completion",
      },
    });

    recordChatUnificationMetric({
      type: "retry_model_continuity",
      surface: "project",
      payload: {
        actualModel: "claude-sonnet",
        expectedModel: "gpt-5.2",
        source: "retry_action",
        preserved: false,
      },
    });

    recordChatUnificationMetric({
      type: "ask_user_context_mismatch",
      surface: "ai",
      payload: {
        mismatch: true,
        expectedPage: "draft",
        expectedSection: "intro",
        resolvedPage: "overview",
        resolvedSection: null,
      },
    });

    recordChatUnificationMetric({
      type: "stuck_running_tools_after_run_end",
      surface: "project",
      payload: {
        unresolvedCount: 2,
        runStatus: "failed",
        streamPhase: "project_stream",
      },
    });

    recordChatUnificationMetric({
      type: "stuck_running_tools_after_run_end",
      surface: "project",
      payload: {
        unresolvedCount: 0,
        runStatus: "completed",
        streamPhase: "project_stream",
      },
    });

    recordChatUnificationMetric({
      type: "run_end_observed",
      surface: "project",
      runId: "run-1",
      payload: {
        runStatus: "completed",
        streamPhase: "project_stream",
      },
    });

    const events = getChatUnificationMetricEvents();
    expect(events).toHaveLength(7);

    const summary = summarizeChatUnificationMetrics(events);
    expect(summary.retryModelContinuity.total).toBe(3);
    expect(summary.retryModelContinuity.preserved).toBe(0);
    expect(summary.retryModelContinuity.rate).toBe(0);

    expect(summary.askUserContextMismatch.total).toBe(1);
    expect(summary.askUserContextMismatch.mismatches).toBe(1);
    expect(summary.askUserContextMismatch.rate).toBe(1);

    expect(summary.stuckRunningToolsAfterRunEnd.total).toBe(2);
    expect(summary.stuckRunningToolsAfterRunEnd.violations).toBe(1);
    expect(summary.stuckRunningToolsAfterRunEnd.rate).toBe(0.5);

    expect(summary.runEndObserved.total).toBe(1);
    expect(summary.runEndObserved.completed).toBe(1);
    expect(summary.runEndObserved.rateCompleted).toBe(1);
  });
});
