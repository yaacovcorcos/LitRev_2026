import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  findFirst: vi.fn(),
  cancelRun: vi.fn(),
  settleClarificationDismissedRun: vi.fn(),
  abortActiveRunExecution: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: mocks.requireApiSession,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    agentRun: {
      findFirst: mocks.findFirst,
    },
  },
}));

vi.mock("@/lib/server/agent/run", () => ({
  cancelRun: mocks.cancelRun,
  settleClarificationDismissedRun: mocks.settleClarificationDismissedRun,
  isRunOwnershipError: (error: unknown) => error instanceof Error && error.name === "RunOwnershipError",
}));

vi.mock("@/lib/server/agent/run-cancellation", () => ({
  abortActiveRunExecution: mocks.abortActiveRunExecution,
}));

const { POST } = await import("../route");

function context(runId = "run-1") {
  return { params: Promise.resolve({ runId }) };
}

describe("/api/ai/runs/[runId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        workspaceId: "ws-1",
      },
    });
    mocks.cancelRun.mockResolvedValue(undefined);
    mocks.settleClarificationDismissedRun.mockResolvedValue(1);
    mocks.abortActiveRunExecution.mockReturnValue(true);
  });

  it("aborts in-process execution and durably cancels a running run owned by the user", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "run-1", status: "running" });

    const response = await POST(new Request("http://localhost/api/ai/runs/run-1/cancel", { method: "POST" }), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId: "run-1",
      status: "cancelled",
      abortedInProcess: true,
      alreadyTerminal: false,
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        userId: "user-1",
      },
      select: {
        id: true,
        status: true,
      },
    });
    expect(mocks.abortActiveRunExecution).toHaveBeenCalledWith("run-1");
    expect(mocks.cancelRun).toHaveBeenCalledWith("run-1");
  });

  it("settles a paused run through the same durable cancellation path", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "run-paused", status: "paused" });

    const response = await POST(new Request("http://localhost/api/ai/runs/run-paused/cancel", { method: "POST" }), context("run-paused"));

    expect(response.status).toBe(200);
    expect(mocks.settleClarificationDismissedRun).toHaveBeenCalledWith("run-paused", { requireActive: true });
    expect(mocks.cancelRun).not.toHaveBeenCalled();
  });

  it("does not cancel runs that are not owned by the authenticated user", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/ai/runs/run-foreign/cancel", { method: "POST" }), context("run-foreign"));

    expect(response.status).toBe(404);
    expect(mocks.abortActiveRunExecution).not.toHaveBeenCalled();
    expect(mocks.cancelRun).not.toHaveBeenCalled();
  });

  it("returns a sanitized conflict when cancellation loses run ownership", async () => {
    const ownershipError = new Error("Run run-1 is no longer writable (status=completed, finalizationState=completed).");
    ownershipError.name = "RunOwnershipError";
    mocks.findFirst
      .mockResolvedValueOnce({ id: "run-1", status: "running" })
      .mockResolvedValueOnce({ status: "running" });
    mocks.cancelRun.mockRejectedValueOnce(ownershipError);

    const response = await POST(new Request("http://localhost/api/ai/runs/run-1/cancel", { method: "POST" }), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Run could not be cancelled because it is no longer writable.",
    });
  });
});
