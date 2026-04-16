import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emitEvent: vi.fn(),
  markRunDurabilityDegraded: vi.fn(),
  isRunOwnershipError: vi.fn(),
}));

vi.mock("@/lib/server/agent/events", () => ({
  emitEvent: mocks.emitEvent,
}));

vi.mock("@/lib/server/agent/run", () => ({
  markRunDurabilityDegraded: mocks.markRunDurabilityDegraded,
  isRunOwnershipError: mocks.isRunOwnershipError,
}));

const { recordRunEvent, getRunEventDurabilityClass } = await import("@/lib/server/agent/run-event-recorder");

describe("run event recorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emitEvent.mockResolvedValue({ id: "evt-1" });
    mocks.markRunDurabilityDegraded.mockResolvedValue(1);
    mocks.isRunOwnershipError.mockReturnValue(false);
  });

  it("classifies context assembly as observability-only", () => {
    expect(getRunEventDurabilityClass("context_assembly")).toBe("observability_only");
    expect(getRunEventDurabilityClass("tool_result")).toBe("recovery_required");
  });

  it("soft-fails observability-only persistence", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.emitEvent.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(recordRunEvent({
      runId: "run-1",
      type: "context_assembly",
      payload: { branch: "memories" },
      logContext: "context_assembly",
    })).resolves.toEqual({ persisted: false, degraded: false });

    expect(mocks.markRunDurabilityDegraded).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("degrades run durability for recovery-required events when requested", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.emitEvent.mockRejectedValueOnce(new Error("write failed"));

    await expect(recordRunEvent({
      runId: "run-1",
      type: "tool_result",
      payload: { callId: "call-1", result: { ok: true } },
      failureMode: "degrade",
      degradationReason: "tool_result_persistence_failed",
      logContext: "tool_result:search_pubmed",
    })).resolves.toEqual({ persisted: false, degraded: true });

    expect(mocks.markRunDurabilityDegraded).toHaveBeenCalledWith(
      "run-1",
      "tool_result_persistence_failed",
    );
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("rethrows strict failures", async () => {
    mocks.emitEvent.mockRejectedValueOnce(new Error("hard failure"));

    await expect(recordRunEvent({
      runId: "run-1",
      type: "tool_call",
      payload: { id: "call-1", name: "search_pubmed", arguments: {} },
      failureMode: "strict",
      logContext: "tool_call:search_pubmed",
    })).rejects.toThrow("hard failure");

    expect(mocks.markRunDurabilityDegraded).not.toHaveBeenCalled();
  });

  it("rethrows run ownership errors without degrading durability", async () => {
    const ownershipError = new Error("run no longer writable");
    mocks.emitEvent.mockRejectedValueOnce(ownershipError);
    mocks.isRunOwnershipError.mockReturnValueOnce(true);

    await expect(recordRunEvent({
      runId: "run-1",
      type: "tool_result",
      payload: { callId: "call-1", result: { ok: true } },
      failureMode: "degrade",
      logContext: "tool_result:search_pubmed",
    })).rejects.toBe(ownershipError);

    expect(mocks.markRunDurabilityDegraded).not.toHaveBeenCalled();
  });
});
