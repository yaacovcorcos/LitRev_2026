// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearChatUnificationMetrics,
  flushChatUnificationMetricsForTests,
  recordChatUnificationMetric,
  setChatUnificationMetricShippingOverrideForTests,
} from "@/lib/ai/chat-unification-telemetry";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("chat unification telemetry shipping", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setChatUnificationMetricShippingOverrideForTests(true);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
    } as Response);
    clearChatUnificationMetrics();
  });

  afterEach(() => {
    clearChatUnificationMetrics();
    setChatUnificationMetricShippingOverrideForTests(null);
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("posts metric payloads to the telemetry endpoint", async () => {
    recordChatUnificationMetric({
      type: "retry_model_continuity",
      surface: "ai",
      conversationId: "conv-1",
      projectId: "project-1",
      payload: {
        requestKey: "7c76966b-84c6-4cf4-98c4-f6c68f7b5911",
        expectedModel: "gpt-5.2",
        source: "retry_action",
      },
    });

    await flushChatUnificationMetricsForTests();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(url).toBe("/api/telemetry/chat-unification");
    expect(options).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );

    const parsedBody = JSON.parse(String((options as RequestInit).body));
    expect(parsedBody).toMatchObject({
      type: "retry_model_continuity",
      surface: "ai",
      conversationId: "conv-1",
      projectId: "project-1",
    });
    expect(parsedBody.eventId).toMatch(UUID_V4_PATTERN);
    expect(parsedBody.clientTimestamp).toBeTruthy();
  });

  it("flushes metrics enqueued while a flush is in progress", async () => {
    vi.useFakeTimers();

    try {
      const firstPostState: { resolve?: () => void } = {};
      globalThis.fetch = vi.fn().mockImplementation(() => {
        if (!firstPostState.resolve) {
          return new Promise((resolve) => {
            firstPostState.resolve = () => resolve({ ok: true, status: 202 } as Response);
          });
        }
        return Promise.resolve({ ok: true, status: 202 } as Response);
      });

      recordChatUnificationMetric({
        type: "retry_model_continuity",
        surface: "ai",
        payload: {
          requestKey: "7c76966b-84c6-4cf4-98c4-f6c68f7b5911",
          expectedModel: "gpt-5.2",
          source: "retry_action",
        },
      });

      await vi.advanceTimersByTimeAsync(500);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      recordChatUnificationMetric({
        type: "run_end_observed",
        surface: "ai",
        payload: {
          requestKey: "7c76966b-84c6-4cf4-98c4-f6c68f7b5911",
          runStatus: "completed",
          streamPhase: "send",
          actualModel: "gpt-5.2",
          actualModelSource: "provider",
        },
      });

      await vi.advanceTimersByTimeAsync(500);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      if (!firstPostState.resolve) {
        throw new Error("First telemetry request was not started");
      }
      firstPostState.resolve();
      await flushChatUnificationMetricsForTests();
      await vi.advanceTimersByTimeAsync(500);

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
