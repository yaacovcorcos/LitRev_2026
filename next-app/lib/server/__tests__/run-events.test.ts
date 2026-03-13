import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runEventFindFirst: vi.fn(),
  runEventCreate: vi.fn(),
  runEventFindMany: vi.fn(),
  agentRunUpdateMany: vi.fn(),
  transaction: vi.fn(),
  noteObservedRunActivity: vi.fn(),
}));

const txMock = {
  runEvent: {
    findFirst: (...args: unknown[]) => mocks.runEventFindFirst(...args),
    create: (...args: unknown[]) => mocks.runEventCreate(...args),
  },
  agentRun: {
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
      updateMany: mocks.agentRunUpdateMany,
    },
  },
}));

vi.mock("@/lib/server/agent/run", () => ({
  noteObservedRunActivity: mocks.noteObservedRunActivity,
}));

const { emitEvent, getRunTimeline } = await import("@/lib/server/agent/events");

describe("run events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 1 });
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
      where: { id: "run-1", status: "running" },
      data: {
        lastActivityAt: expect.any(Date),
        lastDurableProgressAt: expect.any(Date),
      },
    });
    expect(mocks.noteObservedRunActivity).toHaveBeenCalledWith("run-1", expect.any(Date));
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
      where: { id: "run-1", status: "running" },
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

    const result = await emitEvent("run-1", "tool_result", { ok: true });

    expect(result).toEqual({ id: "evt-6", sequence: 6 });
    expect(mocks.runEventCreate).toHaveBeenCalledTimes(2);
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
