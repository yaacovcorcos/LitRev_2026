import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runEventFindFirst: vi.fn(),
  runEventCreate: vi.fn(),
  runEventFindMany: vi.fn(),
  agentRunFindUnique: vi.fn(),
  agentRunUpdateMany: vi.fn(),
  transaction: vi.fn(),
  noteObservedRunActivity: vi.fn(),
  assertRunWritableInTransaction: vi.fn(),
}));

const txMock = {
  runEvent: {
    findFirst: (...args: unknown[]) => mocks.runEventFindFirst(...args),
    create: (...args: unknown[]) => mocks.runEventCreate(...args),
  },
  agentRun: {
    findUnique: (...args: unknown[]) => mocks.agentRunFindUnique(...args),
    updateMany: (...args: unknown[]) => mocks.agentRunUpdateMany(...args),
  },
};

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    runEvent: {
      findFirst: mocks.runEventFindFirst,
      create: mocks.runEventCreate,
      findMany: mocks.runEventFindMany,
    },
    agentRun: {
      findUnique: mocks.agentRunFindUnique,
      updateMany: mocks.agentRunUpdateMany,
    },
  },
}));

vi.mock("@/lib/server/agent/run", () => ({
  noteObservedRunActivity: mocks.noteObservedRunActivity,
  assertRunWritableInTransaction: mocks.assertRunWritableInTransaction,
}));

const { emitEvent, emitEventWithinTransaction, getRunTimeline } = await import("@/lib/server/agent/events");

describe("run events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.assertRunWritableInTransaction.mockResolvedValue(undefined);
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-1",
      status: "running",
      runPhase: "plan",
      phaseEnteredAt: new Date("2026-03-11T11:34:00.000Z"),
    });
  });

  it("emits event with next sequence", async () => {
    mocks.runEventFindFirst.mockResolvedValue({ sequence: 2 });
    mocks.runEventCreate.mockResolvedValue({
      id: "evt-3",
      sequence: 3,
      createdAt: new Date("2026-03-11T11:35:00.000Z"),
    });

    const result = await emitEvent("run-1", "message", { hello: "world" }, { messageRole: "assistant" });

    expect(result).toMatchObject({ id: "evt-3", sequence: 3 });
    expect(mocks.runEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: "run-1",
          sequence: 3,
          type: "message",
          messageRole: "assistant",
        }),
      }),
    );
    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        status: { in: ["running"] },
        completedAt: null,
      },
      data: {
        lastActivityAt: expect.any(Date),
        lastDurableProgressAt: expect.any(Date),
      },
    });
    expect(mocks.noteObservedRunActivity).toHaveBeenCalledWith("run-1", expect.any(Date));
  });

  it("fails closed when the shared run-write guard rejects the event", async () => {
    mocks.assertRunWritableInTransaction.mockRejectedValueOnce(new Error("run no longer writable"));

    await expect(emitEvent("run-1", "message", { hello: "world" })).rejects.toThrow(
      "run no longer writable",
    );
    expect(mocks.runEventCreate).not.toHaveBeenCalled();
  });

  it("keeps durable progress unchanged for observability-only events", async () => {
    mocks.runEventFindFirst.mockResolvedValue({ sequence: 0 });
    mocks.runEventCreate.mockResolvedValue({
      id: "evt-1",
      sequence: 1,
      createdAt: new Date("2026-03-11T11:35:10.000Z"),
    });

    await emitEvent("run-1", "context_assembly", { branch: "memories" });

    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        status: { in: ["running"] },
        completedAt: null,
      },
      data: { lastActivityAt: expect.any(Date) },
    });
  });

  it("retries on runId+sequence uniqueness conflicts", async () => {
    mocks.runEventFindFirst
      .mockResolvedValueOnce({ sequence: 4 })
      .mockResolvedValueOnce({ sequence: 5 });
    mocks.runEventCreate
      .mockRejectedValueOnce({ code: "P2002", meta: { target: ["runId", "sequence"] } })
      .mockResolvedValueOnce({ id: "evt-6", sequence: 6 });
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-03-11T11:34:00.000Z"),
    });

    const result = await emitEvent("run-1", "tool_result", { ok: true });

    expect(result).toEqual({ id: "evt-6", sequence: 6 });
    expect(mocks.runEventCreate).toHaveBeenCalledTimes(2);
  });

  it("persists tool-call phase transitions inside the same transaction", async () => {
    const createdAt = new Date("2026-03-11T11:35:10.000Z");
    mocks.runEventFindFirst.mockResolvedValue({ sequence: 0 });
    mocks.runEventCreate.mockResolvedValue({
      id: "evt-1",
      sequence: 1,
      createdAt,
    });
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-1",
      status: "running",
      runPhase: "plan",
      phaseEnteredAt: new Date("2026-03-11T11:34:00.000Z"),
    });

    await emitEventWithinTransaction(
      txMock as never,
      "run-1",
      "tool_call",
      { id: "call-1", name: "search_pubmed", arguments: {} },
      { toolName: "search_pubmed" },
    );

    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "run-1", status: "running" },
      data: {
        runPhase: "act",
        phaseEnteredAt: createdAt,
      },
    });
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "run-1",
        status: { in: ["running"] },
        completedAt: null,
      },
      data: {
        lastActivityAt: createdAt,
        lastDurableProgressAt: createdAt,
      },
    });
  });

  it("persists verify and ask phase transitions for durable runtime boundaries", async () => {
    const baseCreatedAt = new Date("2026-03-11T11:35:20.000Z");
    mocks.runEventFindFirst.mockResolvedValue({ sequence: 1 });
    mocks.runEventCreate.mockResolvedValue({
      id: "evt-2",
      sequence: 2,
      createdAt: baseCreatedAt,
    });

    mocks.agentRunFindUnique.mockResolvedValueOnce({
      id: "run-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-03-11T11:35:00.000Z"),
    });
    await emitEventWithinTransaction(txMock as never, "run-1", "tool_result", { ok: true }, { toolName: "search_pubmed" });
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "run-1", status: "running" },
      data: {
        runPhase: "verify",
        phaseEnteredAt: baseCreatedAt,
      },
    });
    mocks.agentRunUpdateMany.mockClear();

    mocks.agentRunFindUnique.mockResolvedValueOnce({
      id: "run-1",
      status: "running",
      runPhase: "verify",
      phaseEnteredAt: baseCreatedAt,
    });
    await emitEventWithinTransaction(txMock as never, "run-1", "user_input_required", { callId: "call-1", question: "Continue?", questionType: "yes_no" });
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "run-1", status: "running" },
      data: {
        runPhase: "ask",
        phaseEnteredAt: baseCreatedAt,
      },
    });
    mocks.agentRunUpdateMany.mockClear();

    mocks.agentRunFindUnique.mockResolvedValueOnce({
      id: "run-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: baseCreatedAt,
    });
    await emitEventWithinTransaction(txMock as never, "run-1", "artifact_proposed", { artifactId: "artifact-1" }, { artifactId: "artifact-1" });
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "run-1", status: "running" },
      data: {
        runPhase: "verify",
        phaseEnteredAt: baseCreatedAt,
      },
    });
    mocks.agentRunUpdateMany.mockClear();

    mocks.agentRunFindUnique.mockResolvedValueOnce({
      id: "run-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: baseCreatedAt,
    });
    await emitEventWithinTransaction(txMock as never, "run-1", "artifact_reviewed", { artifactId: "artifact-1", status: "applied" }, { artifactId: "artifact-1" });
    expect(mocks.agentRunUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "run-1", status: "running" },
      data: {
        runPhase: "verify",
        phaseEnteredAt: baseCreatedAt,
      },
    });
  });

  it("formats timeline output in ascending sequence order", async () => {
    mocks.runEventFindMany.mockResolvedValue([
      {
        id: "e1",
        sequence: 0,
        type: "message",
        payload: { content: "hello" },
        toolName: null,
        artifactId: null,
        messageRole: "user",
        durationMs: null,
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
      },
    ]);

    const timeline = await getRunTimeline("run-1");
    expect(timeline).toEqual([
      {
        id: "e1",
        sequence: 0,
        type: "message",
        payload: { content: "hello" },
        toolName: null,
        artifactId: null,
        messageRole: "user",
        durationMs: null,
        createdAt: "2026-02-28T00:00:00.000Z",
      },
    ]);
  });
});
