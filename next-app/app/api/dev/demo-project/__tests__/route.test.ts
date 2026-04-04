import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDevQuickLoginAllowed: vi.fn(),
  hasTrustedDevQuickLoginOrigin: vi.fn(),
  ensureDevQuickLoginIdentity: vi.fn(),
  openOrCreateDemoProject: vi.fn(),
}));

vi.mock("@/lib/server/auth/dev-quick-login", () => ({
  isDevQuickLoginAllowed: (...args: unknown[]) => mocks.isDevQuickLoginAllowed(...args),
  hasTrustedDevQuickLoginOrigin: (...args: unknown[]) => mocks.hasTrustedDevQuickLoginOrigin(...args),
  ensureDevQuickLoginIdentity: (...args: unknown[]) => mocks.ensureDevQuickLoginIdentity(...args),
}));

vi.mock("@/lib/server/demo-project", () => ({
  openOrCreateDemoProject: (...args: unknown[]) => mocks.openOrCreateDemoProject(...args),
}));

const { POST } = await import("@/app/api/dev/demo-project/route");

describe("POST /api/dev/demo-project", () => {
  beforeEach(() => {
    mocks.isDevQuickLoginAllowed.mockReset();
    mocks.hasTrustedDevQuickLoginOrigin.mockReset();
    mocks.ensureDevQuickLoginIdentity.mockReset();
    mocks.openOrCreateDemoProject.mockReset();
    mocks.isDevQuickLoginAllowed.mockReturnValue(true);
    mocks.hasTrustedDevQuickLoginOrigin.mockReturnValue(true);
    mocks.ensureDevQuickLoginIdentity.mockResolvedValue({
      userId: "seed-user",
      workspaceId: "seed-workspace",
    });
    mocks.openOrCreateDemoProject.mockResolvedValue({ id: "demo-project-1" });
  });

  it("returns 404 when dev quick login is disabled", async () => {
    mocks.isDevQuickLoginAllowed.mockReturnValue(false);

    const response = await POST(new Request("http://localhost/api/dev/demo-project", {
      method: "POST",
    }) as never);

    expect(response.status).toBe(404);
  });

  it("returns 403 for an untrusted preview origin", async () => {
    mocks.hasTrustedDevQuickLoginOrigin.mockReturnValue(false);

    const response = await POST(new Request("http://localhost/api/dev/demo-project", {
      method: "POST",
    }) as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invalid origin" });
    expect(mocks.ensureDevQuickLoginIdentity).not.toHaveBeenCalled();
  });

  it("uses seeded identity scope for demo project creation", async () => {
    const response = await POST(new Request("http://localhost/api/dev/demo-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedKey: "phone-seed" }),
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, projectId: "demo-project-1" });
    expect(mocks.ensureDevQuickLoginIdentity).toHaveBeenCalledWith("phone-seed");
    expect(mocks.openOrCreateDemoProject).toHaveBeenCalledWith({
      ownerId: "seed-user",
      workspaceId: "seed-workspace",
    });
  });
});
