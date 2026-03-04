import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => {
  class MockPlatformAdminAccessError extends Error {}

  return {
    requirePlatformAdmin: vi.fn(),
    getAdminUsageAnalytics: vi.fn(),
    notFound: vi.fn(),
    PlatformAdminAccessError: MockPlatformAdminAccessError,
  };
});

vi.mock("@/lib/server/auth/platform-admin", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
  PlatformAdminAccessError: mocks.PlatformAdminAccessError,
}));

vi.mock("@/lib/server/admin/usage-analytics", () => ({
  getAdminUsageAnalytics: mocks.getAdminUsageAnalytics,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

const { default: AdminUsagePage } = await import("@/app/admin/usage/page");

describe("/admin/usage page", () => {
  beforeEach(() => {
    mocks.requirePlatformAdmin.mockReset();
    mocks.getAdminUsageAnalytics.mockReset();
    mocks.notFound.mockReset();

    mocks.getAdminUsageAnalytics.mockResolvedValue({
      windowDays: 30,
      since: new Date("2026-02-03T00:00:00.000Z"),
      totals: {
        requests: 10,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        uniqueUsers: 4,
        uniqueWorkspaces: 2,
        attributedRequests: 8,
        legacyRequests: 2,
      },
      bySource: [],
      byContextPage: [],
      byModel: [],
      byDay: [],
    });
  });

  it("renders analytics for admins", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined);

    const result = await AdminUsagePage({ searchParams: Promise.resolve({ window: "7" }) });

    expect(result).toBeTruthy();
    expect(mocks.requirePlatformAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.getAdminUsageAnalytics).toHaveBeenCalledWith({ windowDays: 7 });
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("falls back to 30-day window for invalid values", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(undefined);

    await AdminUsagePage({ searchParams: Promise.resolve({ window: "999" }) });

    expect(mocks.getAdminUsageAnalytics).toHaveBeenCalledWith({ windowDays: 30 });
  });

  it("calls notFound for non-admin users", async () => {
    const denied = new Error("forbidden");
    Object.setPrototypeOf(denied, mocks.PlatformAdminAccessError.prototype);
    mocks.requirePlatformAdmin.mockRejectedValue(denied);

    await expect(AdminUsagePage({})).rejects.toThrow("forbidden");

    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});
