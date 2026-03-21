import { describe, expect, it } from "vitest";
import { resolveReasoningRequest } from "@/lib/ai/reasoning-request";

describe("resolveReasoningRequest", () => {
  it("keeps summary mode provider-independent for explicit-support models", () => {
    const resolved = resolveReasoningRequest({
      preferredMode: "summary",
      modelId: "claude-haiku-4-5",
    });

    expect(resolved).toEqual({
      reasoningMode: "summary",
      includeReasoning: false,
      reasoningBudgetTokens: undefined,
    });
  });

  it("omits explicit budgets for best-effort models", () => {
    const resolved = resolveReasoningRequest({
      preferredMode: "full",
      modelId: "gpt-5.2",
    });

    expect(resolved).toEqual({
      reasoningMode: "full",
      includeReasoning: true,
      reasoningBudgetTokens: undefined,
    });
  });

  it("degrades full mode to summary for no-support models", () => {
    const resolved = resolveReasoningRequest({
      preferredMode: "full",
      modelId: "gpt-5-mini",
    });

    expect(resolved).toEqual({
      reasoningMode: "summary",
      includeReasoning: false,
      reasoningBudgetTokens: undefined,
    });
  });
});
