import { describe, expect, it, vi } from "vitest";
import { createDefaultProtocolData } from "@/types/protocol";

vi.mock("@/lib/server/ai/ai-service", () => ({
  getAIService: () => ({
    chat: vi.fn(async () => {
      throw new Error("AI unavailable");
    }),
  }),
}));

import {
  deriveOnboardingProfile,
  finalClarification,
  suggestQuestions,
  validateSetup,
} from "@/lib/server/onboarding-ai";

describe("onboarding ai helpers", () => {
  it("returns deterministic question suggestions fallback", async () => {
    const result = await suggestQuestions("exercise and sleep quality");

    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
    expect(result.candidates[0].question.length).toBeGreaterThan(0);
  });

  it("fails launch validation when required setup data is missing", async () => {
    const protocol = createDefaultProtocolData();
    const result = await validateSetup(protocol);

    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => check.id === "question" && !check.passed)).toBe(true);
  });

  it("derives a profile from populated protocol", () => {
    const protocol = createDefaultProtocolData();
    protocol.researchQuestion = "Does intervention X improve endpoint Y in adults?";
    protocol.eligibility.inclusion = ["Adults", "Reports primary endpoint"];
    protocol.eligibility.exclusion = ["No comparator"];
    protocol.searchStrategy.query = "adults AND intervention X AND endpoint Y";

    const profile = deriveOnboardingProfile(protocol);

    expect(profile.strictness).toBe("moderate");
    expect(profile.recallVsPrecision).toBe("balanced");
  });

  it("returns fallback clarification questions when AI is unavailable", async () => {
    const protocol = createDefaultProtocolData();
    protocol.researchQuestion = "Question";
    const result = await finalClarification(protocol, null);

    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.questions[0].options.length).toBeGreaterThan(1);
  });
});
