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
        preserved: true,
        expectedModel: "gpt-5.2",
        actualModel: "gpt-5.2",
        actualModelSource: "provider",
        source: "retry_action",
      },
    });

    recordChatUnificationMetric({
      type: "retry_model_continuity",
      surface: "project",
      payload: {
        preserved: false,
        expectedModel: "gpt-5.2",
        actualModel: "claude-sonnet",
        actualModelSource: "provider",
        source: "retry_action",
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
        actualModel: "gpt-5.2",
        actualModelSource: "provider",
      },
    });

    const events = getChatUnificationMetricEvents();
    expect(events).toHaveLength(6);

    const summary = summarizeChatUnificationMetrics(events);
    expect(summary.retryModelContinuity.total).toBe(2);
    expect(summary.retryModelContinuity.preserved).toBe(1);
    expect(summary.retryModelContinuity.rate).toBe(0.5);

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
