import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDevQuickLoginAllowed: vi.fn(),
  hasTrustedDevQuickLoginOrigin: vi.fn(),
  ensureDevQuickLoginIdentity: vi.fn(),
  getDevQuickLoginIdentity: vi.fn(),
  buildFixtureProjectDescription: vi.fn(),
  createDevFixtureProjectId: vi.fn(),
  createProject: vi.fn(),
  prisma: {
    project: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/auth/dev-quick-login", () => ({
  isDevQuickLoginAllowed: (...args: unknown[]) => mocks.isDevQuickLoginAllowed(...args),
  hasTrustedDevQuickLoginOrigin: (...args: unknown[]) => mocks.hasTrustedDevQuickLoginOrigin(...args),
  ensureDevQuickLoginIdentity: (...args: unknown[]) => mocks.ensureDevQuickLoginIdentity(...args),
  getDevQuickLoginIdentity: (...args: unknown[]) => mocks.getDevQuickLoginIdentity(...args),
  buildFixtureProjectDescription: (...args: unknown[]) => mocks.buildFixtureProjectDescription(...args),
  createDevFixtureProjectId: (...args: unknown[]) => mocks.createDevFixtureProjectId(...args),
}));

vi.mock("@/lib/server/projects", () => ({
  createProject: (...args: unknown[]) => mocks.createProject(...args),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: mocks.prisma,
}));

const { POST } = await import("@/app/api/dev/test-home-state/route");

describe("POST /api/dev/test-home-state", () => {
  beforeEach(() => {
    mocks.isDevQuickLoginAllowed.mockReset();
    mocks.hasTrustedDevQuickLoginOrigin.mockReset();
    mocks.ensureDevQuickLoginIdentity.mockReset();
    mocks.getDevQuickLoginIdentity.mockReset();
    mocks.buildFixtureProjectDescription.mockReset();
    mocks.createDevFixtureProjectId.mockReset();
    mocks.createProject.mockReset();
    mocks.prisma.project.deleteMany.mockReset();
    mocks.prisma.project.findMany.mockReset();

    mocks.isDevQuickLoginAllowed.mockReturnValue(true);
    mocks.hasTrustedDevQuickLoginOrigin.mockReturnValue(true);
    mocks.ensureDevQuickLoginIdentity.mockResolvedValue({
      userId: "seed-user",
      workspaceId: "seed-workspace",
    });
    mocks.getDevQuickLoginIdentity.mockReturnValue({
      fixtureTag: "[e2e-fixture:seed]",
      userId: "seed-user",
      workspaceId: "seed-workspace",
    });
    mocks.buildFixtureProjectDescription.mockReturnValue("[e2e-fixture:seed] workspace");
    mocks.createDevFixtureProjectId.mockReturnValue("workspace-project");
    mocks.prisma.project.deleteMany.mockResolvedValue({ count: 2 });
    mocks.prisma.project.findMany.mockResolvedValue([]);
    mocks.createProject.mockResolvedValue({ id: "workspace-project" });
  });

  it("requires a seed key", async () => {
    const response = await POST(new Request("http://localhost/api/dev/test-home-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "workspace" }),
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "seedKey is required" });
  });

  it("returns 403 for an untrusted preview origin", async () => {
    mocks.hasTrustedDevQuickLoginOrigin.mockReturnValue(false);

    const response = await POST(new Request("http://localhost/api/dev/test-home-state", {
      method: "POST",
    }) as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invalid origin" });
    expect(mocks.ensureDevQuickLoginIdentity).not.toHaveBeenCalled();
  });

  it("deletes only seeded fixtures for empty-workspace setup", async () => {
    const response = await POST(new Request("http://localhost/api/dev/test-home-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedKey: "home-seed", state: "empty_workspace" }),
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      state: "empty_workspace",
      deletedCount: 2,
    });
    expect(mocks.prisma.project.deleteMany).toHaveBeenCalledWith({
      where: {
        ownerId: "seed-user",
        workspaceId: "seed-workspace",
        OR: [
          { demoKey: { not: null } },
          { description: { startsWith: "[e2e-fixture:seed]" } },
        ],
      },
    });
  });

  it("accepts zero_state as a legacy alias for empty-workspace setup", async () => {
    const response = await POST(new Request("http://localhost/api/dev/test-home-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedKey: "home-seed", state: "zero_state" }),
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      state: "empty_workspace",
      deletedCount: 2,
    });
  });

  it("creates a workspace fixture when none exists", async () => {
    const response = await POST(new Request("http://localhost/api/dev/test-home-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedKey: "home-seed", state: "workspace" }),
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      state: "workspace",
      projectId: "workspace-project",
      projectCount: 1,
    });
    expect(mocks.createProject).toHaveBeenCalledWith(
      {
        ownerId: "seed-user",
        workspaceId: "seed-workspace",
      },
      expect.objectContaining({
        id: "workspace-project",
        name: "E2E Workspace Project",
        description: "[e2e-fixture:seed] workspace",
      }),
    );
  });

  it("reuses an existing workspace fixture", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "existing-project" }]);

    const response = await POST(new Request("http://localhost/api/dev/test-home-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedKey: "home-seed", state: "workspace" }),
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      state: "workspace",
      projectId: "existing-project",
      projectCount: 1,
    });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("rejects invalid projectCount values", async () => {
    const response = await POST(new Request("http://localhost/api/dev/test-home-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedKey: "home-seed", state: "workspace", projectCount: 0 }),
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "projectCount must be an integer between 1 and 24",
    });
  });

  it("re-seeds workspace fixtures when the requested projectCount changes", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "existing-1" }]);
    mocks.createProject.mockResolvedValueOnce({ id: "workspace-project-1" });
    mocks.createProject.mockResolvedValueOnce({ id: "workspace-project-2" });

    const response = await POST(new Request("http://localhost/api/dev/test-home-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedKey: "home-seed", state: "workspace", projectCount: 2 }),
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      state: "workspace",
      projectId: "workspace-project-1",
      projectCount: 2,
    });
    expect(mocks.prisma.project.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.createProject).toHaveBeenCalledTimes(2);
  });
});
