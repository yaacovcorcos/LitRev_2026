import { describe, expect, it, vi } from "vitest";
import { ensureConversationRunAvailability } from "@/lib/server/chat-runtime/conversation-run-lock";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
import type {
  RunAbnormalEndClassification,
  RunDurabilityState,
  RunFinalizationState,
  RunPhase,
} from "@/types/agent";

function makeRunningRun(overrides?: Partial<{
  id: string;
  startedAt: Date;
  lastActivityAt: Date;
  lastDurableProgressAt: Date;
  runPhase: RunPhase;
  phaseEnteredAt: Date;
  durabilityState: RunDurabilityState;
  durabilityDegradedReason: string | null;
  finalizationState: RunFinalizationState;
  abnormalEndClassification: RunAbnormalEndClassification | null;
}>) {
  const now = new Date("2026-02-24T00:00:00.000Z");
  return {
    id: overrides?.id ?? "run_live",
    status: "running" as const,
    runPhase: overrides?.runPhase ?? "act",
    phaseEnteredAt: overrides?.phaseEnteredAt ?? now,
    startedAt: overrides?.startedAt ?? now,
    lastActivityAt: overrides?.lastActivityAt ?? now,
    lastDurableProgressAt: overrides?.lastDurableProgressAt ?? now,
    durabilityState: overrides?.durabilityState ?? "durable",
    durabilityDegradedReason: overrides?.durabilityDegradedReason ?? null,
    finalizationState: overrides?.finalizationState ?? "not_started",
    abnormalEndClassification: overrides?.abnormalEndClassification ?? null,
  };
}

describe("conversation run lock guard", () => {
  it("passes when no running runs exist", async () => {
    const store = {
      listRunning: vi.fn(async () => []),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => false),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", { store, now: new Date("2026-02-24T00:00:00.000Z") })
    ).resolves.toEqual({ cancelledStaleRunCount: 0, replacedRunId: null });
  });

  it("cancels stale runs and allows new execution", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn(async () => [makeRunningRun({
        id: "run_old",
        startedAt: new Date("2026-02-23T00:00:00.000Z"),
        lastActivityAt: new Date("2026-02-23T00:00:00.000Z"),
        lastDurableProgressAt: new Date("2026-02-23T00:00:00.000Z"),
      })]),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 1),
      cancelRunIfActive: vi.fn(async () => false),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", { store, now, staleMs: 60_000 })
    ).resolves.toEqual({ cancelledStaleRunCount: 1, replacedRunId: null });
    expect(store.cancelRuns).toHaveBeenCalledWith(["run_old"], now);
  });

  it("throws when a fresh running run exists", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn(async () => [makeRunningRun()]),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => false),
    };

    try {
      await ensureConversationRunAvailability("conv_1", { store, now, staleMs: 60_000 });
      throw new Error("expected active-run conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(AIErrorWithEnvelope);
      expect(error).toMatchObject({
        errorMeta: expect.objectContaining({
          code: "ACTIVE_RUN_EXISTS",
          recoveryRecommendation: "reconnect",
        }),
      });
    }
  });

  it("replaces the named fresh run when replaceRunId matches", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn()
        .mockResolvedValueOnce([makeRunningRun()])
        .mockResolvedValueOnce([]),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => true),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", {
        store,
        now,
        staleMs: 60_000,
        replaceRunId: "run_live",
      })
    ).resolves.toEqual({ cancelledStaleRunCount: 0, replacedRunId: "run_live" });
    expect(store.cancelRunIfActive).toHaveBeenCalledWith("run_live", "conv_1", now);
  });

  it("rejects mismatched replaceRunId without cancelling the active run", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn(async () => [makeRunningRun()]),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => false),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", {
        store,
        now,
        staleMs: 60_000,
        replaceRunId: "run_old",
      })
    ).rejects.toMatchObject({
      errorMeta: expect.objectContaining({ code: "REPLACE_TARGET_MISMATCH" }),
    });
    expect(store.cancelRunIfActive).not.toHaveBeenCalled();
  });

  it("rechecks active run identity when replacement loses the race", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn()
        .mockResolvedValueOnce([makeRunningRun()])
        .mockResolvedValueOnce([makeRunningRun({ id: "run_newer" })]),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => false),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", {
        store,
        now,
        staleMs: 60_000,
        replaceRunId: "run_live",
      })
    ).rejects.toMatchObject({
      errorMeta: expect.objectContaining({ code: "REPLACE_TARGET_MISMATCH" }),
    });
  });

  it("rejects replacement when another fresh run remains after cancelling the target", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn()
        .mockResolvedValueOnce([makeRunningRun()])
        .mockResolvedValueOnce([makeRunningRun({ id: "run_other" })]),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => true),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", {
        store,
        now,
        staleMs: 60_000,
        replaceRunId: "run_live",
      })
    ).rejects.toMatchObject({
      errorMeta: expect.objectContaining({ code: "ACTIVE_RUN_EXISTS" }),
    });
  });

  it("treats old startedAt but recent lastActivityAt as fresh", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn(async () => [makeRunningRun({
        startedAt: new Date("2026-02-23T00:00:00.000Z"),
        lastActivityAt: new Date("2026-02-23T23:59:30.000Z"),
        lastDurableProgressAt: new Date("2026-02-23T23:59:30.000Z"),
      })]),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => false),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", { store, now, staleMs: 60_000 })
    ).rejects.toMatchObject({
      errorMeta: expect.objectContaining({ code: "ACTIVE_RUN_EXISTS" }),
    });
    expect(store.cancelRuns).not.toHaveBeenCalled();
  });

  it("treats fresh heartbeat but stale durable progress as stop-and-retry", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn(async () => [makeRunningRun({
        id: "run_stalled",
        startedAt: new Date("2026-02-23T00:00:00.000Z"),
        lastActivityAt: new Date("2026-02-23T23:59:45.000Z"),
        lastDurableProgressAt: new Date("2026-02-23T23:57:00.000Z"),
      })]),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => false),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", { store, now, staleMs: 60_000 })
    ).rejects.toMatchObject({
      errorMeta: expect.objectContaining({
        code: "ACTIVE_RUN_EXISTS",
        recoveryRecommendation: "stop_and_retry",
      }),
    });
  });

  it("terminalizes fresh ask-phase runs to paused and allows a new send", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn()
        .mockResolvedValueOnce([makeRunningRun({
          id: "run_ask",
          runPhase: "ask",
          lastActivityAt: new Date("2026-02-23T23:59:45.000Z"),
          lastDurableProgressAt: new Date("2026-02-23T23:59:40.000Z"),
        })])
        .mockResolvedValueOnce([]),
      pauseRunIfAwaitingInput: vi.fn(async () => true),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => false),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", { store, now, staleMs: 60_000 })
    ).resolves.toEqual({ cancelledStaleRunCount: 0, replacedRunId: null });
    expect(store.pauseRunIfAwaitingInput).toHaveBeenCalledWith("run_ask", "conv_1", now);
  });

  it("treats stale finalize-phase runs as bounded conflicts instead of reconnectable ones", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn(async () => [makeRunningRun({
        id: "run_finalize",
        runPhase: "finalize",
        phaseEnteredAt: new Date("2026-02-23T23:57:00.000Z"),
        lastActivityAt: new Date("2026-02-23T23:59:45.000Z"),
        lastDurableProgressAt: new Date("2026-02-23T23:59:40.000Z"),
        finalizationState: "in_progress",
      })]),
      pauseRunIfAwaitingInput: vi.fn(async () => false),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => false),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", { store, now, staleMs: 60_000 })
    ).rejects.toMatchObject({
      errorMeta: expect.objectContaining({
        code: "ACTIVE_RUN_EXISTS",
        recoveryRecommendation: "stop_and_retry",
      }),
    });
  });
});
