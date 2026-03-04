import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  isPlatformAdminUser: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: (...args: unknown[]) => mocks.requireApiSession(...args),
}));

vi.mock("@/lib/server/auth/platform-admin", () => ({
  isPlatformAdminUser: (...args: unknown[]) => mocks.isPlatformAdminUser(...args),
}));

const { GET } = await import("@/app/api/admin/status/route");

describe("GET /api/admin/status", () => {
  beforeEach(() => {
    mocks.requireApiSession.mockReset();
    mocks.isPlatformAdminUser.mockReset();
  });

  it("passes through auth failure responses", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(new Request("http://localhost/api/admin/status"));
    expect(response.status).toBe(401);
  });

  it("returns admin flag for authenticated users", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        workspaceId: "workspace-1",
        role: "owner",
      },
    });
    mocks.isPlatformAdminUser.mockResolvedValue(true);

    const response = await GET(new Request("http://localhost/api/admin/status"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ isPlatformAdmin: true });
    expect(mocks.isPlatformAdminUser).toHaveBeenCalledWith("user-1");
  });
});
