import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  agentRunFindUnique: vi.fn(),
  agentRunUpdateMany: vi.fn(),
}));

const txMock = {
  agentRun: {
    findUnique: (...args: unknown[]) => mocks.agentRunFindUnique(...args),
    updateMany: (...args: unknown[]) => mocks.agentRunUpdateMany(...args),
  },
};

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    agentRun: {
      findUnique: mocks.agentRunFindUnique,
      updateMany: mocks.agentRunUpdateMany,
    },
  },
}));

const {
  getRunPhaseTransitionMatrix,
  isRunPhaseTransitionAllowed,
  transitionRunPhase,
  transitionRunPhaseInTransaction,
} = await import("@/lib/server/agent/run-phase");

describe("run-phase transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("exposes the locked transition matrix", () => {
    expect(getRunPhaseTransitionMatrix()).toEqual({
      plan: ["ask", "act", "finalize"],
      ask: ["plan", "act", "finalize"],
      act: ["ask", "verify", "finalize"],
      verify: ["ask", "act", "finalize"],
      finalize: [],
    });
    expect(isRunPhaseTransitionAllowed("act", "verify")).toBe(true);
    expect(isRunPhaseTransitionAllowed("finalize", "act")).toBe(false);
  });

  it("persists a legal transition inside a transaction", async () => {
    const at = new Date("2026-03-14T13:00:00.000Z");
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-1",
      status: "running",
      runPhase: "act",
      phaseEnteredAt: new Date("2026-03-14T12:59:00.000Z"),
    });

    const result = await transitionRunPhaseInTransaction(txMock as never, "run-1", "verify", at);

    expect(result).toEqual({ changed: true, phaseEnteredAt: at });
    expect(mocks.agentRunFindUnique).toHaveBeenCalledWith({
      where: { id: "run-1" },
      select: {
        id: true,
        runPhase: true,
        phaseEnteredAt: true,
      },
    });
    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith({
      where: { id: "run-1", status: "running" },
      data: {
        runPhase: "verify",
        phaseEnteredAt: at,
      },
    });
  });

  it("keeps phaseEnteredAt stable for same-phase writes", async () => {
    const existing = new Date("2026-03-14T12:58:00.000Z");
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-1",
      status: "running",
      runPhase: "verify",
      phaseEnteredAt: existing,
    });

    const result = await transitionRunPhaseInTransaction(
      txMock as never,
      "run-1",
      "verify",
      new Date("2026-03-14T13:00:00.000Z"),
    );

    expect(result).toEqual({ changed: false, phaseEnteredAt: existing });
    expect(mocks.agentRunUpdateMany).not.toHaveBeenCalled();
  });

  it("throws on invalid transitions", async () => {
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-1",
      status: "running",
      runPhase: "finalize",
      phaseEnteredAt: new Date("2026-03-14T12:58:00.000Z"),
    });

    await expect(
      transitionRunPhaseInTransaction(txMock as never, "run-1", "act"),
    ).rejects.toThrow("Invalid run phase transition for run-1: finalize -> act");
    expect(mocks.agentRunUpdateMany).not.toHaveBeenCalled();
  });

  it("uses the shared transaction wrapper for non-transaction callers", async () => {
    mocks.agentRunFindUnique.mockResolvedValue({
      id: "run-1",
      status: "running",
      runPhase: "plan",
      phaseEnteredAt: new Date("2026-03-14T12:58:00.000Z"),
    });

    await transitionRunPhase("run-1", "act", new Date("2026-03-14T13:01:00.000Z"));

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
