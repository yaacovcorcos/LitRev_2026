import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePlatformAdminApi: vi.fn(),
  setPlatformAdminStatus: vi.fn(),
  LastPlatformAdminError: class LastPlatformAdminError extends Error {},
  PlatformAdminMutationError: class PlatformAdminMutationError extends Error {},
}));

vi.mock("@/lib/server/auth/platform-admin", () => ({
  requirePlatformAdminApi: (...args: unknown[]) => mocks.requirePlatformAdminApi(...args),
}));

vi.mock("@/lib/server/admin/platform-admin-mutations", () => ({
  setPlatformAdminStatus: (...args: unknown[]) => mocks.setPlatformAdminStatus(...args),
  LastPlatformAdminError: mocks.LastPlatformAdminError,
  PlatformAdminMutationError: mocks.PlatformAdminMutationError,
}));

const { POST } = await import("@/app/api/admin/users/[userId]/platform-admin/route");

describe("POST /api/admin/users/[userId]/platform-admin", () => {
  beforeEach(() => {
    mocks.requirePlatformAdminApi.mockReset();
    mocks.setPlatformAdminStatus.mockReset();
  });

  it("passes through unauthorized responses", async () => {
    mocks.requirePlatformAdminApi.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ userId: "u1" }),
    });

    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    mocks.requirePlatformAdminApi.mockResolvedValue({
      ok: true,
      context: { userId: "admin-1", workspaceId: "w1", role: "owner", isPlatformAdmin: true },
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ makeAdmin: "yes" }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns success payload for valid mutation", async () => {
    mocks.requirePlatformAdminApi.mockResolvedValue({
      ok: true,
      context: { userId: "admin-1", workspaceId: "w1", role: "owner", isPlatformAdmin: true },
    });
    mocks.setPlatformAdminStatus.mockResolvedValue({
      changed: true,
      targetUserId: "u1",
      isPlatformAdmin: true,
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": "r-1" },
        body: JSON.stringify({ makeAdmin: true, reason: "promotion" }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(mocks.setPlatformAdminStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-1",
        targetUserId: "u1",
        makeAdmin: true,
        reason: "promotion",
        requestId: "r-1",
      }),
    );
  });

  it("maps last-admin conflict to 409", async () => {
    mocks.requirePlatformAdminApi.mockResolvedValue({
      ok: true,
      context: { userId: "admin-1", workspaceId: "w1", role: "owner", isPlatformAdmin: true },
    });
    mocks.setPlatformAdminStatus.mockRejectedValue(new mocks.LastPlatformAdminError("last admin"));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ makeAdmin: false }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(409);
  });
});
