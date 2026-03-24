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
    expect(decision.reason).toBe("repeat_without_progress");
    expect(decision.fallbackAction).toBe("use_recommended_default");
    expect(decision.toolResult.result).toMatchObject({
      status: "clarification_resolved_by_runtime_default",
      reason: "repeat_without_progress",
      fallbackAction: "use_recommended_default",
      resolvedAnswer: "Use the broader evidence-first pass",
    });
    expect(decision.correctiveMessage).toContain("Treat the recommended default");
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
    expect(thirdDecision.reason).toBe("budget_exhausted");
    expect(thirdDecision.fallbackAction).toBe("bounded_terminal_decision");
    expect(thirdDecision.toolResult.result).toMatchObject({
      status: "clarification_terminal_decision_required",
      reason: "budget_exhausted",
      fallbackAction: "bounded_terminal_decision",
    });
  });

  it("uses truthful_stop when no safe default or bounded terminal decision exists", () => {
    const decision = evaluateClarificationRequest({
      state: {
        totalClarificationCount: 2,
        hasDurableProgressSinceLastResolution: true,
        lastResolvedDecisionBoundaryKey: "prior-boundary",
      },
      userInputRequest: {
        callId: "ask-4",
        question: "Describe the exact tradeoff tolerance in your own words.",
        questionType: "free_text",
      },
    });

    expect(decision.allowPause).toBe(false);
    if (decision.allowPause) return;
    expect(decision.reason).toBe("budget_exhausted");
    expect(decision.fallbackAction).toBe("truthful_stop");
    expect(decision.toolResult.result).toMatchObject({
      status: "clarification_truthful_stop_required",
      fallbackAction: "truthful_stop",
      questionType: "free_text",
    });
  });

  it("respects stricter mode policy overrides while still using the shared suppression contract", () => {
    const decision = evaluateClarificationRequest({
      state: {
        totalClarificationCount: 0,
        hasDurableProgressSinceLastResolution: true,
        lastResolvedDecisionBoundaryKey: null,
      },
      userInputRequest: {
        callId: "ask-5",
        question: "Should I narrow to RCTs?",
        questionType: "yes_no",
        recommendedAnswer: "No, stay broad first.",
      },
      policyOverride: {
        allowPause: false,
        correctiveMessage: "Scoping runtime policy: synthesize first.",
        source: "scoping_runtime_policy",
      },
    });

    expect(decision.allowPause).toBe(false);
    if (decision.allowPause) return;
    expect(decision.reason).toBe("mode_policy_blocked");
    expect(decision.fallbackAction).toBe("use_recommended_default");
    expect(decision.toolResult.result).toMatchObject({
      source: "scoping_runtime_policy",
      status: "clarification_resolved_by_runtime_default",
    });
  });
});
