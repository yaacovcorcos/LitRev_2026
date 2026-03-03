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
        requestKey: "b93f7ca5-5ba2-4fcb-9514-f291767fd16d",
        expectedModel: "gpt-5.2",
        source: "retry_action",
      },
    });

    recordChatUnificationMetric({
      type: "retry_model_continuity",
      surface: "project",
      payload: {
        requestKey: "f5ec9b2d-a5d8-4579-ace3-a85bf1ee4a9f",
        expectedModel: "gpt-5.2",
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
        unresolvedCountBeforeClear: 2,
        unresolvedCountAfterClear: 0,
        runStatus: "failed",
        streamPhase: "project_stream",
      },
    });

    recordChatUnificationMetric({
      type: "stuck_running_tools_after_run_end",
      surface: "project",
      payload: {
        unresolvedCount: 0,
        unresolvedCountBeforeClear: 0,
        unresolvedCountAfterClear: 0,
        runStatus: "completed",
        streamPhase: "project_stream",
      },
    });

    recordChatUnificationMetric({
      type: "run_end_observed",
      surface: "ai",
      runId: "run-0",
      payload: {
        requestKey: "b93f7ca5-5ba2-4fcb-9514-f291767fd16d",
        runStatus: "completed",
        streamPhase: "send",
        actualModel: "gpt-5.2",
        actualModelSource: "provider",
      },
    });

    recordChatUnificationMetric({
      type: "run_end_observed",
      surface: "project",
      runId: "run-1",
      payload: {
        requestKey: "f5ec9b2d-a5d8-4579-ace3-a85bf1ee4a9f",
        runStatus: "completed",
        streamPhase: "project_stream",
        actualModel: "claude-sonnet",
        actualModelSource: "provider",
      },
    });

    const events = getChatUnificationMetricEvents();
    expect(events).toHaveLength(7);

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

    expect(summary.runEndObserved.total).toBe(2);
    expect(summary.runEndObserved.completed).toBe(2);
    expect(summary.runEndObserved.rateCompleted).toBe(1);
  });
});
