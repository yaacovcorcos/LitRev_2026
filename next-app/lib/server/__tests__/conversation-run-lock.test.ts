import { describe, expect, it, vi } from "vitest";
import { ensureConversationRunAvailability } from "@/lib/server/chat-runtime/conversation-run-lock";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";

describe("conversation run lock guard", () => {
  it("passes when no running runs exist", async () => {
    const store = {
      listRunning: vi.fn(async () => []),
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
      listRunning: vi.fn(async () => [{ id: "run_old", startedAt: new Date("2026-02-23T00:00:00.000Z") }]),
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
      listRunning: vi.fn(async () => [{ id: "run_live", startedAt: new Date("2026-02-24T00:00:00.000Z") }]),
      cancelRuns: vi.fn(async () => 0),
      cancelRunIfActive: vi.fn(async () => false),
    };

    try {
      await ensureConversationRunAvailability("conv_1", { store, now, staleMs: 60_000 });
      throw new Error("expected active-run conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(AIErrorWithEnvelope);
      expect(error).toMatchObject({
        errorMeta: expect.objectContaining({ code: "ACTIVE_RUN_EXISTS" }),
      });
    }
  });

  it("replaces the named fresh run when replaceRunId matches", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn()
        .mockResolvedValueOnce([{ id: "run_live", startedAt: now }])
        .mockResolvedValueOnce([]),
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
      listRunning: vi.fn(async () => [{ id: "run_live", startedAt: now }]),
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
        .mockResolvedValueOnce([{ id: "run_live", startedAt: now }])
        .mockResolvedValueOnce([{ id: "run_newer", startedAt: now }]),
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
        .mockResolvedValueOnce([{ id: "run_live", startedAt: now }])
        .mockResolvedValueOnce([{ id: "run_other", startedAt: now }]),
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
});
