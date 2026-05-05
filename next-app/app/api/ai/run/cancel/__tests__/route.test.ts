import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getConversationWithSummaryById: vi.fn(),
  abortRegisteredRun: vi.fn(),
  cancelConversationRun: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: mocks.requireApiSession,
}));

vi.mock("@/lib/server/ai/memory", () => ({
  getConversationWithSummaryById: mocks.getConversationWithSummaryById,
}));

vi.mock("@/lib/server/agent/run-cancellation", () => ({
  abortRegisteredRun: mocks.abortRegisteredRun,
}));

vi.mock("@/lib/server/agent/run", () => ({
  cancelConversationRun: mocks.cancelConversationRun,
}));

const { POST } = await import("../route");

describe("/api/ai/run/cancel route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        workspaceId: "ws-1",
      },
    });
    mocks.getConversationWithSummaryById.mockResolvedValue({ id: "conv-1" });
    mocks.abortRegisteredRun.mockReturnValue(true);
    mocks.cancelConversationRun.mockResolvedValue(1);
  });

  it("aborts the in-process run and durably marks the owned run cancelled", async () => {
    const request = new NextRequest("http://localhost/api/ai/run/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "conv-1",
        runId: "run-1",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cancelled: true,
      abortedInProcess: true,
    });
    expect(mocks.getConversationWithSummaryById).toHaveBeenCalledWith("conv-1", "user-1", "ws-1");
    expect(mocks.abortRegisteredRun).toHaveBeenCalledWith("run-1");
    expect(mocks.cancelConversationRun).toHaveBeenCalledWith("run-1", "conv-1");
  });

  it("does not cancel a run when the conversation is not owned by the user", async () => {
    mocks.getConversationWithSummaryById.mockResolvedValue(null);
    const request = new NextRequest("http://localhost/api/ai/run/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "conv-1",
        runId: "run-1",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cancelled: false,
      abortedInProcess: false,
    });
    expect(mocks.abortRegisteredRun).not.toHaveBeenCalled();
    expect(mocks.cancelConversationRun).not.toHaveBeenCalled();
  });
});
