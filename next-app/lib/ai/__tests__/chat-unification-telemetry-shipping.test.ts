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
        preserved: true,
        expectedModel: "gpt-5.2",
        actualModel: "gpt-5.2",
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
});
