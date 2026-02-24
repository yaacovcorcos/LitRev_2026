import { describe, expect, it, vi } from "vitest";
import { ensureConversationRunAvailability } from "@/lib/server/chat-runtime/conversation-run-lock";

describe("conversation run lock guard", () => {
  it("passes when no running runs exist", async () => {
    const store = {
      listRunning: vi.fn(async () => []),
      cancelRuns: vi.fn(async () => 0),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", { store, now: new Date("2026-02-24T00:00:00.000Z") })
    ).resolves.toEqual({ cancelledStaleRunCount: 0 });
  });

  it("cancels stale runs and allows new execution", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn(async () => [{ id: "run_old", startedAt: new Date("2026-02-23T00:00:00.000Z") }]),
      cancelRuns: vi.fn(async () => 1),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", { store, now, staleMs: 60_000 })
    ).resolves.toEqual({ cancelledStaleRunCount: 1 });
    expect(store.cancelRuns).toHaveBeenCalledWith(["run_old"], now);
  });

  it("throws when a fresh running run exists", async () => {
    const now = new Date("2026-02-24T00:00:00.000Z");
    const store = {
      listRunning: vi.fn(async () => [{ id: "run_live", startedAt: new Date("2026-02-24T00:00:00.000Z") }]),
      cancelRuns: vi.fn(async () => 0),
    };

    await expect(
      ensureConversationRunAvailability("conv_1", { store, now, staleMs: 60_000 })
    ).rejects.toThrow("already has an active run");
  });
});

