import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentRunFindFirst: vi.fn(),
  runEventFindMany: vi.fn(),
  decisionRequestFindFirst: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    agentRun: {
      findFirst: mocks.agentRunFindFirst,
    },
    runEvent: {
      findMany: mocks.runEventFindMany,
    },
    decisionRequestRecord: {
      findFirst: mocks.decisionRequestFindFirst,
    },
  },
}));

vi.mock("@/lib/server/agent/run-event-recorder", () => ({
  recordRunEvent: vi.fn(async () => ({ persisted: true, degraded: false })),
}));

const { resolvePendingUserInputSource } = await import("@/lib/server/ai/clarification-controller");

describe("clarification decision request records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-1",
      conversationId: "conv-1",
    });
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.decisionRequestFindFirst.mockResolvedValue(null);
  });

  it("resolves pending ask_user state from the first-class decision record before scanning run events", async () => {
    mocks.decisionRequestFindFirst.mockResolvedValueOnce({
      id: "decision-record-1",
      callId: "ask-1",
      sourceRunId: "run-1",
      rootRunId: "root-1",
      conversationId: "conv-1",
      projectId: "project-1",
      userId: "user-1",
      studyId: null,
      decisionBoundaryKey: "search-source",
      status: "pending",
      createdAt: new Date("2026-05-05T20:00:00.000Z"),
      resolvedAt: null,
      request: {
        callId: "ask-1",
        questionId: "ask-1:question-1",
        sourceRunId: "run-1",
        question: "Which source should I search first?",
        questionType: "single_choice",
        options: [{ optionId: "pubmed", label: "PubMed" }, { optionId: "openalex", label: "OpenAlex" }],
        decisionBoundaryKey: "search-source",
        decisionRequest: {
          id: "ask-1",
          callId: "ask-1",
          sourceRunId: "run-1",
          rootRunId: "root-1",
          conversationId: "conv-1",
          projectId: "project-1",
          userId: "user-1",
          decisionBoundaryKey: "search-source",
          decisionKind: "clarification",
          blockingLevel: "blocking",
          status: "pending",
          questions: [
            {
              questionId: "ask-1:question-1",
              prompt: "Which source should I search first?",
              responseKind: "single_choice",
              required: true,
              allowNote: true,
              allowOther: false,
              isSecret: false,
              options: [{ optionId: "pubmed", label: "PubMed" }, { optionId: "openalex", label: "OpenAlex" }],
            },
          ],
        },
      },
    });

    const source = await resolvePendingUserInputSource({
      sourceRunId: "run-1",
      conversationId: "conv-1",
      callId: "ask-1",
    });

    expect(source).toMatchObject({
      sourceRunId: "run-1",
      conversationId: "conv-1",
      requiredSequence: -1,
      request: {
        callId: "ask-1",
        questionId: "ask-1:question-1",
        decisionRequest: {
          rootRunId: "root-1",
          status: "pending",
        },
      },
    });
    expect(mocks.runEventFindMany).not.toHaveBeenCalled();
  });

  it("rejects already-resolved decision records instead of replaying stale cards", async () => {
    mocks.decisionRequestFindFirst.mockResolvedValueOnce({
      id: "decision-record-1",
      callId: "ask-1",
      sourceRunId: "run-1",
      rootRunId: "root-1",
      conversationId: "conv-1",
      projectId: null,
      userId: null,
      studyId: null,
      decisionBoundaryKey: "search-source",
      status: "answered",
      createdAt: new Date("2026-05-05T20:00:00.000Z"),
      resolvedAt: new Date("2026-05-05T20:01:00.000Z"),
      request: { callId: "ask-1", question: "Question?", questionType: "yes_no" },
    });

    await expect(resolvePendingUserInputSource({
      sourceRunId: "run-1",
      conversationId: "conv-1",
      callId: "ask-1",
    })).rejects.toThrow("already been resolved");
    expect(mocks.runEventFindMany).not.toHaveBeenCalled();
  });

  it("falls back to run events for legacy pending requests without decision records", async () => {
    mocks.runEventFindMany.mockResolvedValueOnce([
      {
        runId: "run-1",
        sequence: 4,
        type: "user_input_required",
        payload: {
          callId: "ask-legacy",
          question: "Continue?",
          questionType: "yes_no",
        },
        toolName: null,
        createdAt: new Date("2026-05-05T20:00:00.000Z"),
      },
    ]);

    const source = await resolvePendingUserInputSource({
      sourceRunId: "run-1",
      conversationId: "conv-1",
      callId: "ask-legacy",
    });

    expect(source).toMatchObject({
      requiredSequence: 4,
      request: {
        callId: "ask-legacy",
        questionId: "ask-legacy:question-1",
        decisionRequest: {
          id: "ask-legacy",
          sourceRunId: "run-1",
          conversationId: "conv-1",
          status: "pending",
        },
      },
    });
  });
});
