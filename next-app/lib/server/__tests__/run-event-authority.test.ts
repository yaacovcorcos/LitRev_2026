import { describe, expect, it } from "vitest";

import {
  DURABLE_PROGRESS_RUN_EVENT_TYPES,
  RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES,
  isDurableProgressRunEventType,
  isRecoveryAuthoritativeRunEventType,
} from "@/lib/server/agent/run-event-authority";

describe("run event authority", () => {
  it("keeps replay authority broader than durable-progress authority", () => {
    expect(RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES).toContain("tool_call");
    expect(RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES).toContain("checkpoint");
    expect(RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES).toContain("error");

    expect(DURABLE_PROGRESS_RUN_EVENT_TYPES).not.toContain("tool_call");
    expect(DURABLE_PROGRESS_RUN_EVENT_TYPES).not.toContain("checkpoint");
    expect(DURABLE_PROGRESS_RUN_EVENT_TYPES).not.toContain("error");
  });

  it("treats completed durable boundaries as durable progress", () => {
    expect(isDurableProgressRunEventType("message")).toBe(true);
    expect(isDurableProgressRunEventType("tool_result")).toBe(true);
    expect(isDurableProgressRunEventType("artifact_proposed")).toBe(true);
    expect(isDurableProgressRunEventType("user_input_required")).toBe(true);
  });

  it("still replays observability-important events that are not durable progress", () => {
    expect(isRecoveryAuthoritativeRunEventType("tool_call")).toBe(true);
    expect(isRecoveryAuthoritativeRunEventType("checkpoint")).toBe(true);
    expect(isRecoveryAuthoritativeRunEventType("error")).toBe(true);

    expect(isDurableProgressRunEventType("tool_call")).toBe(false);
    expect(isDurableProgressRunEventType("checkpoint")).toBe(false);
    expect(isDurableProgressRunEventType("error")).toBe(false);
  });
});
