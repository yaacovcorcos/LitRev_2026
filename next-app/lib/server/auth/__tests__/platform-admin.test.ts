import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  requireApiSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  getAuthContext: mocks.getAuthContext,
  requireApiSession: mocks.requireApiSession,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
    },
  },
}));

import {
  PlatformAdminAccessError,
  requirePlatformAdmin,
  requirePlatformAdminApi,
  requirePlatformAdminBackground,
  withPlatformAdminAction,
} from "@/lib/server/auth/platform-admin";

describe("platform admin guard", () => {
  beforeEach(() => {
    mocks.getAuthContext.mockReset();
    mocks.requireApiSession.mockReset();
    mocks.findUnique.mockReset();
  });

  it("allows admin context in server boundary guard", async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: "u1",
      workspaceId: "w1",
      role: "owner",
    });
    mocks.findUnique.mockResolvedValue({ isPlatformAdmin: true });

    const result = await requirePlatformAdmin();

    expect(result).toEqual({
      userId: "u1",
      workspaceId: "w1",
      role: "owner",
      isPlatformAdmin: true,
    });
  });

  it("denies non-admin in server boundary guard", async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: "u2",
      workspaceId: "w1",
      role: "member",
    });
    mocks.findUnique.mockResolvedValue({ isPlatformAdmin: false });

    await expect(requirePlatformAdmin()).rejects.toBeInstanceOf(PlatformAdminAccessError);
  });

  it("enforces admin guard for server action wrapper", async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: "u3",
      workspaceId: "w1",
      role: "owner",
    });
    mocks.findUnique.mockResolvedValue({ isPlatformAdmin: true });

    const action = vi.fn(async () => "ok");
    const result = await withPlatformAdminAction(action);

    expect(result).toBe("ok");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("denies non-admin for server action wrapper", async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: "u4",
      workspaceId: "w1",
      role: "member",
    });
    mocks.findUnique.mockResolvedValue({ isPlatformAdmin: false });

    const action = vi.fn(async () => "ok");
    await expect(withPlatformAdminAction(action)).rejects.toBeInstanceOf(PlatformAdminAccessError);
    expect(action).not.toHaveBeenCalled();
  });

  it("passes through session failures in API guard", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const request = new Request("http://localhost/api/admin/test");
    const result = await requirePlatformAdminApi(request);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected API guard failure.");
    }
    expect(result.response.status).toBe(401);
  });

  it("allows admin in API guard", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: {
        userId: "u5",
        workspaceId: "w1",
        role: "owner",
      },
    });
    mocks.findUnique.mockResolvedValue({ isPlatformAdmin: true });

    const request = new Request("http://localhost/api/admin/test");
    const result = await requirePlatformAdminApi(request);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected API guard success.");
    }
    expect(result.context.isPlatformAdmin).toBe(true);
    expect(result.context.userId).toBe("u5");
  });

  it("returns 403 for non-admin in API guard", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: {
        userId: "u6",
        workspaceId: "w1",
        role: "member",
      },
    });
    mocks.findUnique.mockResolvedValue({ isPlatformAdmin: false });

    const request = new Request("http://localhost/api/admin/test");
    const result = await requirePlatformAdminApi(request);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected API guard failure.");
    }
    expect(result.response.status).toBe(403);
  });

  it("allows admin in background boundary guard", async () => {
    mocks.findUnique.mockResolvedValue({ isPlatformAdmin: true });

    await expect(requirePlatformAdminBackground("u7")).resolves.toBeUndefined();
  });

  it("denies non-admin in background boundary guard", async () => {
    mocks.findUnique.mockResolvedValue({ isPlatformAdmin: false });

    await expect(requirePlatformAdminBackground("u8")).rejects.toBeInstanceOf(
      PlatformAdminAccessError,
    );
  });
});
