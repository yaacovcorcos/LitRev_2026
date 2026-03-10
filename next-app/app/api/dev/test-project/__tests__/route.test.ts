import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDevQuickLoginAllowed: vi.fn(),
  ensureDevQuickLoginIdentity: vi.fn(),
  buildFixtureProjectDescription: vi.fn(),
  createDevFixtureProjectId: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock("@/lib/server/auth/dev-quick-login", () => ({
  isDevQuickLoginAllowed: (...args: unknown[]) => mocks.isDevQuickLoginAllowed(...args),
  ensureDevQuickLoginIdentity: (...args: unknown[]) => mocks.ensureDevQuickLoginIdentity(...args),
  buildFixtureProjectDescription: (...args: unknown[]) => mocks.buildFixtureProjectDescription(...args),
  createDevFixtureProjectId: (...args: unknown[]) => mocks.createDevFixtureProjectId(...args),
}));

vi.mock("@/lib/server/projects", () => ({
  createProject: (...args: unknown[]) => mocks.createProject(...args),
}));

const { POST } = await import("@/app/api/dev/test-project/route");

describe("POST /api/dev/test-project", () => {
  beforeEach(() => {
    mocks.isDevQuickLoginAllowed.mockReset();
    mocks.ensureDevQuickLoginIdentity.mockReset();
    mocks.buildFixtureProjectDescription.mockReset();
    mocks.createDevFixtureProjectId.mockReset();
    mocks.createProject.mockReset();
    mocks.isDevQuickLoginAllowed.mockReturnValue(true);
    mocks.ensureDevQuickLoginIdentity.mockResolvedValue({
      userId: "seed-user",
      workspaceId: "seed-workspace",
    });
    mocks.buildFixtureProjectDescription.mockReturnValue("[e2e-fixture:seed] fixture");
    mocks.createDevFixtureProjectId.mockReturnValue("project-seeded");
    mocks.createProject.mockResolvedValue({ id: "project-seeded" });
  });

  it("returns 404 when dev quick login is disabled", async () => {
    mocks.isDevQuickLoginAllowed.mockReturnValue(false);

    const response = await POST(new Request("http://localhost/api/dev/test-project", {
      method: "POST",
    }) as never);

    expect(response.status).toBe(404);
  });

  it("creates a seeded fixture project", async () => {
    const response = await POST(new Request("http://localhost/api/dev/test-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seedKey: "protocol-seed",
        name: "Protocol Fixture",
        description: "Ready fixture",
      }),
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, projectId: "project-seeded" });
    expect(mocks.ensureDevQuickLoginIdentity).toHaveBeenCalledWith("protocol-seed");
    expect(mocks.buildFixtureProjectDescription).toHaveBeenCalledWith("protocol-seed", "Ready fixture");
    expect(mocks.createProject).toHaveBeenCalledWith(
      {
        ownerId: "seed-user",
        workspaceId: "seed-workspace",
      },
      expect.objectContaining({
        id: "project-seeded",
        name: "Protocol Fixture",
        description: "[e2e-fixture:seed] fixture",
      }),
    );
  });
});
