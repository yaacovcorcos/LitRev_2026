import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => {
  class MockPlatformAdminAccessError extends Error {}

  return {
    requirePlatformAdmin: vi.fn(),
    notFound: vi.fn(),
    PlatformAdminAccessError: MockPlatformAdminAccessError,
  };
});

vi.mock("@/lib/server/auth/platform-admin", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
  PlatformAdminAccessError: mocks.PlatformAdminAccessError,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

const { default: AdminPage } = await import("@/app/admin/page");

describe("/admin page", () => {
  beforeEach(() => {
    mocks.requirePlatformAdmin.mockReset();
    mocks.notFound.mockReset();
  });

  it("renders admin shell for platform admins", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined);

    const result = await AdminPage();

    expect(result).toBeTruthy();
    expect(mocks.requirePlatformAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("calls notFound for non-admin users", async () => {
    const denied = new Error("forbidden");
    Object.setPrototypeOf(denied, mocks.PlatformAdminAccessError.prototype);
    mocks.requirePlatformAdmin.mockRejectedValue(denied);

    await expect(AdminPage()).rejects.toThrow("forbidden");

    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("rethrows unexpected errors", async () => {
    const failure = new Error("db down");
    mocks.requirePlatformAdmin.mockRejectedValue(failure);

    await expect(AdminPage()).rejects.toThrow("db down");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
