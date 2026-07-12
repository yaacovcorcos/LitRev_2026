import { describe, expect, it } from "vitest";
import { resolveReasoningRequest } from "@/lib/ai/reasoning-request";

describe("resolveReasoningRequest", () => {
  it("turns raw gateway reasoning off when no safe summary is available", () => {
    const resolved = resolveReasoningRequest({
      preferredMode: "summary",
      modelId: "deepseek-v4-pro",
    });

    expect(resolved).toEqual({
      reasoningMode: "off",
      includeReasoning: false,
      reasoningBudgetTokens: undefined,
    });
  });

  it("turns visible reasoning off for direct models without changing compute effort", () => {
    const resolved = resolveReasoningRequest({
      preferredMode: "full",
      modelId: "gpt-5.6-luna",
    });

    expect(resolved).toEqual({
      reasoningMode: "off",
      includeReasoning: false,
      reasoningBudgetTokens: undefined,
    });
  });

  it("fails closed for unknown visible-reasoning contracts", () => {
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
