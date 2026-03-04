import { describe, expect, it } from "vitest";
import {
  createLifecycleSnapshot,
  finalizeLifecycle,
  terminalReasonFromRunEnd,
  terminalReasonFromThrownError,
} from "@/lib/ai/stream-lifecycle";

describe("stream lifecycle", () => {
  it("applies terminal state exactly once", () => {
    const started = createLifecycleSnapshot("attempt-1");
    const first = finalizeLifecycle(started, "completed");
    expect(first.applied).toBe(true);
    expect(first.snapshot.phase).toBe("terminal");
    expect(first.snapshot.terminalReason).toBe("completed");

    const second = finalizeLifecycle(first.snapshot, "failed_server");
    expect(second.applied).toBe(false);
    expect(second.snapshot.terminalReason).toBe("completed");
  });

  it("maps run_end completed to completed", () => {
    expect(terminalReasonFromRunEnd({ runStatus: "completed", stopReason: null })).toBe("completed");
  });

  it("maps cancelled stop reason to cancelled_by_user", () => {
    expect(terminalReasonFromRunEnd({ runStatus: "failed", stopReason: "cancelled" })).toBe("cancelled_by_user");
  });

  it("maps network-ish errors to failed_network", () => {
    expect(terminalReasonFromThrownError(new TypeError("Failed to fetch"))).toBe("failed_network");
  });

  it("maps explicit timeout to timed_out", () => {
    expect(terminalReasonFromThrownError(new Error("anything"), { timedOut: true })).toBe("timed_out");
  });
});
