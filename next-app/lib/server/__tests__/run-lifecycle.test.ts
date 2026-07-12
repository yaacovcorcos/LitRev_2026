import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentRunCreate: vi.fn(),
  agentRunFindUnique: vi.fn(),
  agentRunFindFirst: vi.fn(),
  agentRunFindMany: vi.fn(),
  agentRunUpdate: vi.fn(),
  agentRunUpdateMany: vi.fn(),
  transaction: vi.fn(),
  aiMessageCount: vi.fn(),
  after: vi.fn(),
  extractMemoriesFromConversation: vi.fn(),
  transitionRunPhaseInTransaction: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    agentRun: {
      create: mocks.agentRunCreate,
      findUnique: mocks.agentRunFindUnique,
      findFirst: mocks.agentRunFindFirst,
      findMany: mocks.agentRunFindMany,
      update: mocks.agentRunUpdate,
      updateMany: mocks.agentRunUpdateMany,
    },
    aIMessage: {
      count: mocks.aiMessageCount,
    },
  },
}));

vi.mock("@/lib/server/memory/conversation-extractor", () => ({
  extractMemoriesFromConversation: mocks.extractMemoriesFromConversation,
}));

vi.mock("@/lib/server/agent/run-phase", () => ({
  transitionRunPhaseInTransaction: mocks.transitionRunPhaseInTransaction,
}));

const {
  RunOwnershipError,
  startRun,
  endRun,
  startRunHeartbeat,
  RUN_HEARTBEAT_INTERVAL_MS,
  getRunLineage,
  markRunAbnormalEndClassification,
  markRunDurabilityDegraded,
  markRunFinalizationFailed,
  markRunFinalizationState,
  recordRunGenerationReceipt,
  settleClarificationDismissedRun,
} = await import("@/lib/server/agent/run");

beforeEach(() => {
  mocks.after.mockImplementation(() => undefined);
});

describe("startRun lineage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentRunCreate.mockResolvedValue({ id: "run-new" });
    mocks.agentRunUpdate.mockResolvedValue({
      id: "run-new",
      conversationId: null,
      projectId: null,
      userId: null,
    });
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.agentRunFindFirst.mockResolvedValue(null);
    mocks.queryRaw.mockResolvedValue([{ locked: 1 }]);
    mocks.transaction.mockImplementation(
      async (
        callback: (tx: {
          agentRun: {
            create: typeof mocks.agentRunCreate;
            findUnique: typeof mocks.agentRunFindUnique;
            findFirst: typeof mocks.agentRunFindFirst;
            updateMany: typeof mocks.agentRunUpdateMany;
          };
          $queryRaw: typeof mocks.queryRaw;
        }) => Promise<unknown>,
      ) =>
        callback({
      agentRun: {
            create: mocks.agentRunCreate,
        findUnique: mocks.agentRunFindUnique,
            findFirst: mocks.agentRunFindFirst,
        updateMany: mocks.agentRunUpdateMany,
      },
          $queryRaw: mocks.queryRaw,
        }),
    );
    mocks.transitionRunPhaseInTransaction.mockResolvedValue({
      changed: true,
      phaseEnteredAt: new Date("2026-03-14T12:00:00.000Z"),
    });
  });

  it("creates a root run without lineage when no parent is provided", async () => {
    await startRun({
      projectId: "p1",
      conversationId: "c1",
      userId: "u1",
      trigger: "user_message",
      agentMode: "general",
      model: "gpt-5.6-luna",
      provider: "openai",
      reasoningEffort: "medium",
      deliveryMode: "priority",
    });

    expect(mocks.agentRunFindUnique).not.toHaveBeenCalled();
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.agentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentRunId: undefined,
          rootRunId: undefined,
          model: "gpt-5.6-luna",
          provider: "openai",
          reasoningEffort: "medium",
          deliveryMode: "priority",
          runPhase: "plan",
          phaseEnteredAt: expect.any(Date),
          lastActivityAt: expect.any(Date),
          lastDurableProgressAt: expect.any(Date),
          finalizationState: "not_started",
          startedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("derives rootRunId from parent when creating child runs", async () => {
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-parent",
      projectId: "p1",
      conversationId: "c1",
      userId: "u1",
      rootRunId: "run-root",
    });

    await startRun({
      projectId: "p1",
      conversationId: "c1",
      userId: "u1",
      parentRunId: "run-parent",
      trigger: "event",
      agentMode: "search",
      model: "gpt-5.2",
    });

    expect(mocks.agentRunFindUnique).toHaveBeenCalledWith({
      where: { id: "run-parent" },
      select: {
        id: true,
        projectId: true,
        conversationId: true,
        userId: true,
        rootRunId: true,
      },
    });
    expect(mocks.agentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentRunId: "run-parent",
          rootRunId: "run-root",
        }),
      }),
    );
  });

  it("uses parent id as root when parent has no rootRunId", async () => {
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-parent",
      projectId: "p1",
      conversationId: null,
      userId: null,
      rootRunId: null,
    });

    await startRun({
      projectId: "p1",
      parentRunId: "run-parent",
      trigger: "event",
      agentMode: "search",
    });

    expect(mocks.agentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentRunId: "run-parent",
          rootRunId: "run-parent",
          runPhase: "plan",
        }),
      }),
    );
  });

  it("accepts an explicit initial phase", async () => {
    await startRun({
      projectId: "p1",
      conversationId: "c1",
      userId: "u1",
      trigger: "user_message",
      agentMode: "general",
      initialPhase: "verify",
    });

    expect(mocks.agentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runPhase: "verify",
          phaseEnteredAt: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects a second user-message run at the atomic admission boundary", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({
      id: "run-active",
      lastActivityAt: new Date("2026-03-20T10:00:00.000Z"),
    });

    await expect(
      startRun({
        projectId: "p1",
        conversationId: "c1",
        userId: "u1",
        trigger: "user_message",
        agentMode: "general",
      }),
    ).rejects.toMatchObject({ errorCode: "ACTIVE_RUN_EXISTS" });

    expect(mocks.agentRunCreate).not.toHaveBeenCalled();
  });

  it("throws when parent run does not exist", async () => {
    mocks.agentRunFindUnique.mockResolvedValue(null);

    await expect(
      startRun({
        projectId: "p1",
        parentRunId: "missing-parent",
        trigger: "event",
        agentMode: "search",
      }),
    ).rejects.toThrow("Parent run not found");
  });

  it("throws on cross-project lineage mismatch", async () => {
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-parent",
      projectId: "p2",
      rootRunId: "run-root",
    });

    await expect(
      startRun({
        projectId: "p1",
        parentRunId: "run-parent",
        trigger: "event",
        agentMode: "search",
      }),
    ).rejects.toThrow("Parent run project does not match child run project");
  });
});

describe("run freshness lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-1",
      conversationId: "conv-1",
      projectId: "project-1",
      userId: "user-1",
      durabilityState: "durable",
      status: "running",
      runPhase: "act",
      completedAt: null,
      finalizationState: "not_started",
      memoryExtractionStatus: "pending",
    });
    mocks.aiMessageCount.mockResolvedValue(0);
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.agentRunFindFirst.mockResolvedValue(null);
    mocks.queryRaw.mockResolvedValue([{ locked: 1 }]);
    mocks.transaction.mockImplementation(
      async (
        callback: (tx: {
          agentRun: {
            create: typeof mocks.agentRunCreate;
            findUnique: typeof mocks.agentRunFindUnique;
            findFirst: typeof mocks.agentRunFindFirst;
            updateMany: typeof mocks.agentRunUpdateMany;
          };
          $queryRaw: typeof mocks.queryRaw;
        }) => Promise<unknown>,
      ) =>
        callback({
      agentRun: {
            create: mocks.agentRunCreate,
        findUnique: mocks.agentRunFindUnique,
            findFirst: mocks.agentRunFindFirst,
        updateMany: mocks.agentRunUpdateMany,
      },
          $queryRaw: mocks.queryRaw,
        }),
    );
    mocks.transitionRunPhaseInTransaction.mockResolvedValue({
      changed: true,
      phaseEnteredAt: new Date("2026-03-14T12:00:00.000Z"),
    });
  });

  it("updates lastActivityAt when ending a run", async () => {
    await endRun("run-1", "completed", 10, 20);

    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        status: "running",
        completedAt: null,
      },
      data: expect.objectContaining({
        status: "completed",
        completedAt: expect.any(Date),
        lastActivityAt: expect.any(Date),
        lastDurableProgressAt: expect.any(Date),
        finalizationState: "completed",
        memoryExtractionStatus: "pending",
        memoryExtractionAttempts: 0,
        memoryExtractionLeaseToken: null,
        memoryExtractionLeaseExpiresAt: null,
        memoryExtractionCompletedAt: null,
        memoryExtractionLastError: null,
        abnormalEndClassification: null,
        costTokensIn: 10,
        costTokensOut: 20,
      }),
    });
  });

  it("commits the pending extraction marker before registering nonblocking work", async () => {
    let registeredTask: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((task: () => Promise<void>) => {
      registeredTask = task;
    });
    mocks.extractMemoriesFromConversation.mockImplementation(
      () => new Promise(() => undefined),
    );

    await expect(endRun("run-1", "completed", 10, 20)).resolves.toMatchObject({
      id: "run-1",
    });

    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ memoryExtractionStatus: "pending" }),
    }));
    expect(registeredTask).toEqual(expect.any(Function));
    expect(mocks.extractMemoriesFromConversation).not.toHaveBeenCalled();
  });

  it("retains durable pending state when after registration is unavailable", async () => {
    mocks.after.mockImplementationOnce(() => {
      throw new Error("after is unavailable outside a request");
    });

    await expect(endRun("run-1", "completed")).resolves.toMatchObject({ id: "run-1" });

    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "completed",
        memoryExtractionStatus: "pending",
      }),
    }));
    expect(mocks.extractMemoriesFromConversation).not.toHaveBeenCalled();
  });

  it("records provider receipts only while the run still owns execution", async () => {
    await recordRunGenerationReceipt("run-1", {
      actualModel: "gpt-5.6-luna",
      actualProvider: "openai",
      actualReasoningEffort: "medium",
      actualDeliveryMode: "standard",
    });

    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        status: "running",
        completedAt: null,
      },
      data: {
        actualModel: "gpt-5.6-luna",
        actualProvider: "openai",
        actualReasoningEffort: "medium",
        actualDeliveryMode: "standard",
      },
    });
  });

  it("throws a run ownership error when endRun loses the terminal write race", async () => {
    mocks.agentRunUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.agentRunFindUnique
      .mockResolvedValueOnce({ durabilityState: "durable" })
      .mockResolvedValueOnce({
        id: "run-1",
        status: "cancelled",
        completedAt: new Date("2026-03-14T12:00:00.000Z"),
        finalizationState: "completed",
      });

    await expect(endRun("run-1", "completed")).rejects.toBeInstanceOf(
      RunOwnershipError,
    );
  });

  it("marks finalization state and abnormal-end classification through centralized helpers", async () => {
    await markRunFinalizationState("run-1", "in_progress");
    await markRunAbnormalEndClassification("run-1", "unknown");
    await markRunFinalizationFailed("run-1");

    expect(mocks.transitionRunPhaseInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        agentRun: expect.objectContaining({
          updateMany: mocks.agentRunUpdateMany,
        }),
      }),
      "run-1",
      "finalize",
      expect.any(Date),
    );
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "run-1",
        status: "running",
        completedAt: null,
      },
      data: {
        finalizationState: "in_progress",
        lastActivityAt: expect.any(Date),
      },
    });
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "run-1",
        status: "running",
        completedAt: null,
      },
      data: {
        abnormalEndClassification: "unknown",
        lastActivityAt: expect.any(Date),
      },
    });
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(3, {
      where: {
        id: "run-1",
        status: "running",
        completedAt: null,
      },
      data: {
        finalizationState: "failed",
        abnormalEndClassification: "finalization_failed",
        lastActivityAt: expect.any(Date),
      },
    });
  });

  it("settles dismissed clarification runs as cancelled terminal state", async () => {
    await settleClarificationDismissedRun("run-1");

    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        status: { in: ["running", "paused"] },
      },
      data: {
        status: "cancelled",
        completedAt: expect.any(Date),
        lastActivityAt: expect.any(Date),
        lastDurableProgressAt: expect.any(Date),
        finalizationState: "completed",
        abnormalEndClassification: null,
      },
    });
  });

  it("throws a run ownership error when strict abnormal-end writes lose ownership", async () => {
    mocks.agentRunUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.agentRunFindUnique.mockResolvedValueOnce({
      id: "run-1",
      status: "cancelled",
      completedAt: new Date("2026-03-14T12:00:00.000Z"),
      finalizationState: "completed",
    });

    await expect(
      markRunAbnormalEndClassification("run-1", "unknown", {
        requireActive: true,
      }),
    ).rejects.toBeInstanceOf(RunOwnershipError);
  });

  it("throws a run ownership error when strict durability degradation loses ownership", async () => {
    mocks.agentRunUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.agentRunFindUnique.mockResolvedValueOnce({
      id: "run-1",
      status: "cancelled",
      completedAt: new Date("2026-03-14T12:00:00.000Z"),
      finalizationState: "completed",
    });

    await expect(
      markRunDurabilityDegraded("run-1", "tool_result_persistence_failed", {
        requireActive: true,
      }),
    ).rejects.toBeInstanceOf(RunOwnershipError);
  });

  it("heartbeats only after the quiet interval elapses", async () => {
    vi.useFakeTimers();
    const touch = vi.fn().mockResolvedValue(1);
    const controller = startRunHeartbeat("run-1", {
      touch,
      intervalMs: RUN_HEARTBEAT_INTERVAL_MS,
    });

    await vi.advanceTimersByTimeAsync(RUN_HEARTBEAT_INTERVAL_MS - 1);
    expect(touch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(touch).toHaveBeenCalledWith("run-1", expect.any(Date));

    controller.stop();
    vi.useRealTimers();
  });

  it("stops heartbeating when the run is no longer active", async () => {
    const ticks: Array<() => void | Promise<void>> = [];
    const timer = { unref: vi.fn() } as unknown as ReturnType<
      typeof setInterval
    >;
    const schedule = vi.fn((callback: () => void | Promise<void>) => {
      ticks.push(callback);
      return timer;
    });
    const cancel = vi.fn();
    const touch = vi.fn().mockResolvedValue(0);
    const now = vi
      .fn()
      .mockReturnValueOnce(new Date("2026-03-14T12:00:00.000Z"))
      .mockReturnValue(new Date("2026-03-14T12:00:15.000Z"));

    const controller = startRunHeartbeat("run-terminal", {
      intervalMs: RUN_HEARTBEAT_INTERVAL_MS,
      touch,
      now,
      schedule: schedule as unknown as typeof setInterval,
      cancel,
    });

    await ticks[0]?.();
    await ticks[0]?.();

    expect(touch).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(timer);

    controller.stop();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("getRunLineage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a rooted run tree for a child run id", async () => {
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "child-1",
      rootRunId: "root-1",
    });
    mocks.agentRunFindMany.mockResolvedValue([
      {
        id: "root-1",
        projectId: "p1",
        conversationId: "c1",
        userId: "u1",
        parentRunId: null,
        rootRunId: null,
        trigger: "user_message",
        agentMode: "general",
        status: "completed",
        model: "gpt-5.2",
        costTokensIn: 100,
        costTokensOut: 50,
        startedAt: new Date("2026-02-28T10:00:00.000Z"),
        completedAt: new Date("2026-02-28T10:00:05.000Z"),
      },
      {
        id: "child-1",
        projectId: "p1",
        conversationId: "c1",
        userId: "u1",
        parentRunId: "root-1",
        rootRunId: "root-1",
        trigger: "event",
        agentMode: "search",
        status: "completed",
        model: "gpt-5.2",
        costTokensIn: 40,
        costTokensOut: 20,
        startedAt: new Date("2026-02-28T10:00:01.000Z"),
        completedAt: new Date("2026-02-28T10:00:03.000Z"),
      },
      {
        id: "child-2",
        projectId: "p1",
        conversationId: "c1",
        userId: "u1",
        parentRunId: "root-1",
        rootRunId: "root-1",
        trigger: "event",
        agentMode: "protocol",
        status: "failed",
        model: "gpt-5.2",
        costTokensIn: 20,
        costTokensOut: 5,
        startedAt: new Date("2026-02-28T10:00:02.000Z"),
        completedAt: new Date("2026-02-28T10:00:04.000Z"),
      },
    ]);

    const lineage = await getRunLineage("child-1");

    expect(mocks.agentRunFindUnique).toHaveBeenCalledWith({
      where: { id: "child-1" },
      select: { id: true, rootRunId: true },
    });
    expect(mocks.agentRunFindMany).toHaveBeenCalledWith({
      where: {
        OR: [{ id: "root-1" }, { rootRunId: "root-1" }],
      },
      orderBy: { startedAt: "asc" },
    });
    expect(lineage?.id).toBe("root-1");
    expect(lineage?.children).toHaveLength(2);
    expect(lineage?.children.map((c) => c.id)).toEqual(["child-1", "child-2"]);
  });

  it("returns null when run does not exist", async () => {
    mocks.agentRunFindUnique.mockResolvedValue(null);
    const lineage = await getRunLineage("missing");
    expect(lineage).toBeNull();
    expect(mocks.agentRunFindMany).not.toHaveBeenCalled();
  });
});
