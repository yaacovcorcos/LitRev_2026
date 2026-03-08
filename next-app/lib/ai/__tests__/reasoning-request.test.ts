import { describe, expect, it } from "vitest";
import { resolveReasoningRequest } from "@/lib/ai/reasoning-request";

describe("resolveReasoningRequest", () => {
  it("keeps explicit reasoning budgets for explicit-support models", () => {
    const resolved = resolveReasoningRequest({
      preferredMode: "summary",
      modelId: "claude-haiku-4-5",
    });

    expect(resolved).toEqual({
      reasoningMode: "summary",
      includeReasoning: true,
      reasoningBudgetTokens: 512,
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

  it("forces reasoning off for no-support models", () => {
    const resolved = resolveReasoningRequest({
      preferredMode: "full",
      modelId: "gpt-5-mini",
    });

    expect(resolved).toEqual({
      reasoningMode: "off",
      includeReasoning: false,
      reasoningBudgetTokens: undefined,
    });
  });
});
