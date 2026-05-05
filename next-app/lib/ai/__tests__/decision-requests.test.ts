import { describe, expect, it } from "vitest";
import {
  buildDecisionResolutionFromUserInput,
  normalizeUserInputRequestWithDecisionRequest,
} from "@/lib/ai/decision-requests";

describe("decision request helpers", () => {
  it("wraps legacy ask_user payloads in a canonical decision request", () => {
    const request = normalizeUserInputRequestWithDecisionRequest({
      request: {
        callId: "ask-1",
        question: "Which source should I search first?",
        questionType: "single_choice",
        options: [
          { label: "PubMed", description: "Biomedical database" },
          { label: "OpenAlex", description: "Broad scholarly graph" },
        ],
        context: "The first source changes the next search step.",
        recommendedAnswer: "PubMed",
        recommendedReason: "It is the safest first pass for biomedical questions.",
      },
      sourceRunId: "run-1",
      rootRunId: "root-1",
      conversationId: "conv-1",
      projectId: "project-1",
      userId: "user-1",
    });

    expect(request).toMatchObject({
      callId: "ask-1",
      questionId: "ask-1:question-1",
      question: "Which source should I search first?",
      decisionBoundaryKey: "which-source-should-i-search-first",
      decisionRequest: {
        id: "ask-1",
        sourceRunId: "run-1",
        rootRunId: "root-1",
        conversationId: "conv-1",
        projectId: "project-1",
        userId: "user-1",
        status: "pending",
        recommendedPathSummary: "PubMed",
        recommendedPathReason: "It is the safest first pass for biomedical questions.",
        questions: [
          {
            questionId: "ask-1:question-1",
            prompt: "Which source should I search first?",
            responseKind: "single_choice",
            recommendedOptionId: "pubmed",
            options: [
              { optionId: "pubmed", label: "PubMed", description: "Biomedical database" },
              { optionId: "openalex", label: "OpenAlex", description: "Broad scholarly graph" },
            ],
          },
        ],
      },
    });
  });

  it("maps accepted recommendations to canonical decision resolutions", () => {
    const request = normalizeUserInputRequestWithDecisionRequest({
      request: {
        callId: "ask-1",
        question: "Continue with broad search?",
        questionType: "yes_no",
        recommendedAnswer: "Yes",
        recommendedReason: "It avoids premature narrowing.",
      },
      sourceRunId: "run-1",
    });

    const resolution = buildDecisionResolutionFromUserInput({
      request,
      resolution: {
        sourceRunId: "run-1",
        callId: "ask-1",
        questionId: "ask-1:question-1",
        resolution: "accept_recommended",
        answeredAt: "2026-05-05T20:00:00.000Z",
      },
    });

    expect(resolution).toEqual({
      requestId: "ask-1",
      callId: "ask-1",
      sourceRunId: "run-1",
      resolutionKind: "accepted_recommended",
      answeredAt: "2026-05-05T20:00:00.000Z",
      decisionBoundaryKey: "continue-with-broad-search",
      answers: [
        {
          questionId: "ask-1:question-1",
          selectedOptionIds: ["yes"],
          freeText: "Yes",
          note: "It avoids premature narrowing.",
        },
      ],
    });
  });

  it("maps legacy choice answer text back to option ids", () => {
    const request = normalizeUserInputRequestWithDecisionRequest({
      request: {
        callId: "ask-1",
        question: "Which source?",
        questionType: "single_choice",
        options: [{ label: "PubMed" }, { label: "OpenAlex" }],
      },
      sourceRunId: "run-1",
    });

    const resolution = buildDecisionResolutionFromUserInput({
      request,
      resolution: {
        sourceRunId: "run-1",
        callId: "ask-1",
        questionId: "ask-1:question-1",
        resolution: "answered",
        answerText: "OpenAlex",
        answeredAt: "2026-05-05T20:00:00.000Z",
      },
    });

    expect(resolution.answers).toEqual([
      {
        questionId: "ask-1:question-1",
        selectedOptionIds: ["openalex"],
        note: "OpenAlex",
      },
    ]);
  });

  it("rejects oversized canonical decision bundles instead of truncating questions", () => {
    expect(() => normalizeUserInputRequestWithDecisionRequest({
      request: {
        callId: "ask-1",
        question: "Primary?",
        questionType: "yes_no",
        decisionRequest: {
          id: "ask-1",
          callId: "ask-1",
          decisionBoundaryKey: "too-many",
          decisionKind: "clarification",
          blockingLevel: "blocking",
          status: "pending",
          questions: [1, 2, 3, 4].map((index) => ({
            questionId: `ask-1:question-${index}`,
            prompt: `Question ${index}?`,
            responseKind: "yes_no",
            required: true,
            allowNote: true,
            allowOther: false,
            isSecret: false,
          })),
        },
      },
    })).toThrow("more than three questions");
  });
});
