import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentRunFindFirst: vi.fn(),
  runEventFindMany: vi.fn(),
  decisionRequestFindFirst: vi.fn(),
  decisionRequestUpsert: vi.fn(),
  decisionResolutionFindUnique: vi.fn(),
  recordRunEvent: vi.fn(),
  transaction: vi.fn(),
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
      upsert: mocks.decisionRequestUpsert,
    },
    decisionResolutionRecord: {
      findUnique: mocks.decisionResolutionFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/server/agent/run-event-recorder", () => ({
  recordRunEvent: mocks.recordRunEvent,
}));

const { persistUserInputResolution, resolvePendingUserInputSource } = await import("@/lib/server/ai/clarification-controller");
const {
  DecisionResolutionAlreadyClaimedError,
  resolveDecisionRequestForUserInputWithinTransaction,
} = await import("@/lib/server/ai/decision-request-store");
const { buildDecisionResolutionFromUserInput } = await import("@/lib/ai/decision-requests");

const actor = {
  userId: "user-1",
  workspaceId: "workspace-1",
};

describe("clarification decision request records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-1",
      conversationId: "conv-1",
      rootRunId: "root-1",
      projectId: "project-1",
      userId: "user-1",
    });
    mocks.runEventFindMany.mockResolvedValue([]);
    mocks.decisionRequestFindFirst.mockResolvedValue(null);
    mocks.decisionRequestUpsert.mockResolvedValue({ id: "decision-record-1" });
    mocks.decisionResolutionFindUnique.mockResolvedValue(null);
    mocks.recordRunEvent.mockResolvedValue({ persisted: true, degraded: false });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      decisionRequestRecord: {
        upsert: mocks.decisionRequestUpsert,
      },
    }));
  });

  it("[runtime-decision-request-durable-pause] resolves pending ask_user state from the first-class decision record before scanning run events", async () => {
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
      actor,
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

  it("rehydrates an already-resolved decision record so an exact transport retry can be verified", async () => {
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

    const source = await resolvePendingUserInputSource({
      sourceRunId: "run-1",
      conversationId: "conv-1",
      callId: "ask-1",
      actor,
    });
    expect(source).toMatchObject({
      sourceRunId: "run-1",
      request: { callId: "ask-1" },
    });
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
      actor,
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
    expect(mocks.decisionRequestUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        sourceRunId: "run-1",
        userId: "user-1",
      }),
    }));
  });

  it("denies a foreign clarification source before reading decision or event payloads", async () => {
    mocks.agentRunFindFirst.mockResolvedValueOnce(null);

    await expect(resolvePendingUserInputSource({
      sourceRunId: "run-foreign",
      conversationId: "conv-foreign",
      callId: "ask-foreign",
      actor,
    })).rejects.toThrow("source run could not be found");

    expect(mocks.agentRunFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "run-foreign",
        conversationId: "conv-foreign",
        OR: [
          { userId: "user-1" },
          { project: { ownerId: "user-1", workspaceId: "workspace-1" } },
        ],
      }),
    }));
    expect(mocks.decisionRequestFindFirst).not.toHaveBeenCalled();
    expect(mocks.runEventFindMany).not.toHaveBeenCalled();
  });

  it("atomically attributes one resolution and rejects a second pending-state claimant", async () => {
    const decisionRequestFindFirst = vi.fn().mockResolvedValue({ id: "decision-record-1" });
    const decisionRequestUpdateMany = vi.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const decisionResolutionCreate = vi.fn().mockResolvedValue({ id: "resolution-1" });
    const tx = {
      decisionRequestRecord: {
        findFirst: decisionRequestFindFirst,
        updateMany: decisionRequestUpdateMany,
      },
      decisionResolutionRecord: {
        create: decisionResolutionCreate,
      },
    };
    const request = {
      callId: "ask-1",
      question: "Continue?",
      questionType: "yes_no" as const,
    };
    const resolution = {
      sourceRunId: "run-1",
      callId: "ask-1",
      resolution: "answered" as const,
      answerText: "Yes",
      answeredAt: "2026-05-05T20:01:00.000Z",
    };

    await resolveDecisionRequestForUserInputWithinTransaction(tx as never, {
      request,
      resolution,
      actorUserId: "user-1",
    });
    await expect(resolveDecisionRequestForUserInputWithinTransaction(tx as never, {
      request,
      resolution,
      actorUserId: "user-2",
    })).rejects.toThrow("already been resolved");

    expect(decisionRequestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "decision-record-1", status: "pending" },
    }));
    expect(decisionResolutionCreate).toHaveBeenCalledTimes(1);
    expect(decisionResolutionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: "decision-record-1",
        userId: "user-1",
      }),
    });
  });

  it("accepts only an exact same-actor resolution retry without appending a duplicate event", async () => {
    const request = {
      callId: "ask-1",
      question: "Continue?",
      questionType: "yes_no" as const,
    };
    const resolution = {
      sourceRunId: "run-1",
      callId: "ask-1",
      resolution: "answered" as const,
      answerText: "Yes",
      answeredAt: "2026-05-05T20:01:00.000Z",
    };
    mocks.recordRunEvent.mockRejectedValueOnce(
      new DecisionResolutionAlreadyClaimedError("decision-record-1"),
    );
    mocks.decisionRequestFindFirst.mockResolvedValueOnce({ id: "decision-record-1" });
    mocks.decisionResolutionFindUnique.mockResolvedValueOnce({
      userId: "user-1",
      resolution: buildDecisionResolutionFromUserInput({ request, resolution }),
    });

    await expect(persistUserInputResolution({
      request,
      resolution: { ...resolution, answeredAt: "2026-05-05T20:02:00.000Z" },
      actorUserId: "user-1",
    })).resolves.toBeUndefined();

    expect(mocks.recordRunEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects a conflicting actor or answer after the decision is claimed", async () => {
    const request = {
      callId: "ask-1",
      question: "Continue?",
      questionType: "yes_no" as const,
    };
    const resolution = {
      sourceRunId: "run-1",
      callId: "ask-1",
      resolution: "answered" as const,
      answerText: "No",
      answeredAt: "2026-05-05T20:02:00.000Z",
    };
    const conflict = new DecisionResolutionAlreadyClaimedError("decision-record-1");
    mocks.recordRunEvent.mockRejectedValueOnce(conflict);
    mocks.decisionRequestFindFirst.mockResolvedValueOnce({ id: "decision-record-1" });
    mocks.decisionResolutionFindUnique.mockResolvedValueOnce({
      userId: "user-1",
      resolution: buildDecisionResolutionFromUserInput({
        request,
        resolution: { ...resolution, answerText: "Yes" },
      }),
    });

    await expect(persistUserInputResolution({
      request,
      resolution,
      actorUserId: "user-2",
    })).rejects.toBe(conflict);
  });
});
