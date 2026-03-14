import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentRunCreate: vi.fn(),
  agentRunFindUnique: vi.fn(),
  agentRunFindMany: vi.fn(),
  agentRunUpdate: vi.fn(),
  agentRunUpdateMany: vi.fn(),
  aiMessageCount: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    agentRun: {
      create: mocks.agentRunCreate,
      findUnique: mocks.agentRunFindUnique,
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
  extractMemoriesFromConversation: vi.fn(),
}));

const {
  startRun,
  endRun,
  startRunHeartbeat,
  RUN_HEARTBEAT_INTERVAL_MS,
  getRunLineage,
  markRunAbnormalEndClassification,
  markRunFinalizationFailed,
  markRunFinalizationState,
} = await import("@/lib/server/agent/run");

describe("startRun lineage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentRunCreate.mockResolvedValue({ id: "run-new" });
    mocks.agentRunUpdate.mockResolvedValue({ id: "run-new", conversationId: null, projectId: null, userId: null });
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("creates a root run without lineage when no parent is provided", async () => {
    await startRun({
      projectId: "p1",
      conversationId: "c1",
      userId: "u1",
      trigger: "user_message",
      agentMode: "general",
      model: "gpt-5.2",
    });

    expect(mocks.agentRunFindUnique).not.toHaveBeenCalled();
    expect(mocks.agentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentRunId: undefined,
          rootRunId: undefined,
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
      select: { id: true, projectId: true, rootRunId: true },
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
    mocks.agentRunUpdate.mockResolvedValue({
      id: "run-1",
      conversationId: "conv-1",
      projectId: "project-1",
      userId: "user-1",
      status: "completed",
    });
    mocks.aiMessageCount.mockResolvedValue(0);
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("updates lastActivityAt when ending a run", async () => {
    await endRun("run-1", "completed", 10, 20);

    expect(mocks.agentRunUpdate).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "completed",
        completedAt: expect.any(Date),
        lastActivityAt: expect.any(Date),
        lastDurableProgressAt: expect.any(Date),
        finalizationState: "completed",
        abnormalEndClassification: null,
        costTokensIn: 10,
        costTokensOut: 20,
      }),
    });
  });

  it("marks finalization state and abnormal-end classification through centralized helpers", async () => {
    await markRunFinalizationState("run-1", "in_progress");
    await markRunAbnormalEndClassification("run-1", "unknown");
    await markRunFinalizationFailed("run-1");

    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "run-1" },
      data: {
        finalizationState: "in_progress",
        lastActivityAt: expect.any(Date),
      },
    });
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "run-1" },
      data: {
        abnormalEndClassification: "unknown",
        lastActivityAt: expect.any(Date),
      },
    });
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(3, {
      where: { id: "run-1" },
      data: {
        finalizationState: "failed",
        abnormalEndClassification: "finalization_failed",
        lastActivityAt: expect.any(Date),
      },
    });
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
