import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDevQuickLoginIdentity: vi.fn(),
  hasTrustedDevQuickLoginOrigin: vi.fn(),
  isDevQuickLoginAllowed: vi.fn(),
  sessionCreate: vi.fn(),
}));

vi.mock("@/lib/server/auth/dev-quick-login", () => ({
  ensureDevQuickLoginIdentity: (...args: unknown[]) => mocks.ensureDevQuickLoginIdentity(...args),
  hasTrustedDevQuickLoginOrigin: (...args: unknown[]) => mocks.hasTrustedDevQuickLoginOrigin(...args),
  isDevQuickLoginAllowed: (...args: unknown[]) => mocks.isDevQuickLoginAllowed(...args),
  normalizeCallbackUrl: (value: unknown) => typeof value === "string" ? value : "/ai",
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    session: { create: (...args: unknown[]) => mocks.sessionCreate(...args) },
  },
}));

vi.mock("@/lib/server/auth/auth-rate-limit", () => ({
  clearAuthFailures: vi.fn(),
  extractClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/server/auth/auth-secret", () => ({
  getBetterAuthSecret: vi.fn(() => "test-secret"),
}));

vi.mock("better-call", () => ({
  serializeSignedCookie: vi.fn(async () => "better-auth.session_token=test"),
}));

const { POST } = await import("@/app/api/dev/quick-login/route");

describe("POST /api/dev/quick-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDevQuickLoginAllowed.mockReturnValue(true);
    mocks.hasTrustedDevQuickLoginOrigin.mockReturnValue(true);
    mocks.ensureDevQuickLoginIdentity.mockResolvedValue({ userId: "dev-user" });
    mocks.sessionCreate.mockResolvedValue({ id: "session-1" });
  });

  it("returns a recoverable service error when the local database is unavailable", async () => {
    mocks.ensureDevQuickLoginIdentity.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }),
    );

    const response = await POST(new Request("http://localhost/api/dev/quick-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callbackUrl: "/ai" }),
    }) as never);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    await expect(response.json()).resolves.toEqual({
      error: "Local workspace database is unavailable. Start PostgreSQL and try again.",
    });
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });
});
