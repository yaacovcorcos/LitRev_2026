import { describe, expect, it } from "vitest";
import {
  buildRunEndObservedPayload,
  deriveChatUnificationStreamPhase,
  deriveChatUnificationSurface,
} from "@/lib/server/ai/chat-unification-runtime-metrics";

describe("chat-unification-runtime-metrics", () => {
  it("derives ai surface only for ai page", () => {
    expect(deriveChatUnificationSurface({ page: "ai" })).toBe("ai");
    expect(deriveChatUnificationSurface({ page: "overview" })).toBe("project");
    expect(deriveChatUnificationSurface()).toBe("project");
  });

  it("derives plan stream phase regardless of page", () => {
    expect(deriveChatUnificationStreamPhase({ options: { page: "ai" }, isPlanExecution: true })).toBe("plan");
    expect(deriveChatUnificationStreamPhase({ options: { page: "overview" }, isPlanExecution: true })).toBe("plan");
  });

  it("derives non-plan stream phase by page", () => {
    expect(deriveChatUnificationStreamPhase({ options: { page: "ai" }, isPlanExecution: false })).toBe("send");
    expect(deriveChatUnificationStreamPhase({ options: { page: "overview" }, isPlanExecution: false })).toBe("project_stream");
  });

  it("builds payload with null requestKey fallback", () => {
    expect(
      buildRunEndObservedPayload({
        runStatus: "completed",
        streamPhase: "send",
        actualModel: "gpt-5.2",
        actualModelSource: "provider",
      }),
    ).toEqual({
      requestKey: null,
      runStatus: "completed",
      streamPhase: "send",
      actualModel: "gpt-5.2",
      actualModelSource: "provider",
      firstProviderContentMs: null,
    });
  });
});
