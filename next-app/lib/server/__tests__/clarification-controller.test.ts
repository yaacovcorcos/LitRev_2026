import { describe, expect, it } from "vitest";

import {
  evaluateClarificationRequest,
  markClarificationProgress,
  resolveDecisionBoundaryKey,
} from "@/lib/server/ai/clarification-controller";

describe("clarification controller", () => {
  it("normalizes a decision boundary key from the question when none is supplied", () => {
    expect(resolveDecisionBoundaryKey({
      decisionBoundaryKey: null,
      question: "Which direction should I take first?",
    })).toBe("which-direction-should-i-take-first");
  });

  it("suppresses a repeated blocking clarification before durable progress", () => {
    const decision = evaluateClarificationRequest({
      state: {
        totalClarificationCount: 1,
        hasDurableProgressSinceLastResolution: false,
        lastResolvedDecisionBoundaryKey: "which-direction",
      },
      userInputRequest: {
        callId: "ask-2",
        question: "Which direction?",
        questionType: "single_choice",
        decisionBoundaryKey: "which-direction",
        recommendedAnswer: "Use the broader evidence-first pass",
      },
    });

    expect(decision.allowPause).toBe(false);
    if (decision.allowPause) return;
    expect(decision.toolResult.result).toMatchObject({
      status: "clarification_suppressed",
      reason: "repeat_without_progress",
    });
    expect(decision.correctiveMessage).toContain("recommended default");
  });

  it("allows one additional clarification after durable progress but suppresses a third total clarification", () => {
    const progressedState = markClarificationProgress({
      totalClarificationCount: 1,
      hasDurableProgressSinceLastResolution: false,
      lastResolvedDecisionBoundaryKey: "which-direction",
    });

    const secondDecision = evaluateClarificationRequest({
      state: progressedState,
      userInputRequest: {
        callId: "ask-2",
        question: "Should I narrow to RCTs now?",
        questionType: "yes_no",
      },
    });

    expect(secondDecision.allowPause).toBe(true);
    if (!secondDecision.allowPause) return;

    const thirdDecision = evaluateClarificationRequest({
      state: {
        ...secondDecision.nextState,
        hasDurableProgressSinceLastResolution: true,
      },
      userInputRequest: {
        callId: "ask-3",
        question: "Should I also limit to English-only studies?",
        questionType: "yes_no",
      },
    });

    expect(thirdDecision.allowPause).toBe(false);
    if (thirdDecision.allowPause) return;
    expect(thirdDecision.toolResult.result).toMatchObject({
      status: "clarification_suppressed",
      reason: "budget_exhausted",
    });
  });
});
