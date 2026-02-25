import { describe, expect, it } from "vitest";
import {
  isDevQuickLoginAllowed,
  normalizeCallbackUrl,
} from "@/lib/server/auth/dev-quick-login";

describe("dev quick login guard", () => {
  it("allows quick login in preview when explicitly enabled", () => {
    expect(
      isDevQuickLoginAllowed({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        ENABLE_DEV_QUICK_LOGIN: "1",
      }),
    ).toBe(true);
  });

  it("blocks quick login in production deployments", () => {
    expect(
      isDevQuickLoginAllowed({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        ENABLE_DEV_QUICK_LOGIN: "1",
      }),
    ).toBe(false);
  });

  it("allows quick login in local development when enabled", () => {
    expect(
      isDevQuickLoginAllowed({
        NODE_ENV: "development",
        ENABLE_DEV_QUICK_LOGIN: "1",
      }),
    ).toBe(true);
  });

  it("blocks quick login when feature flag is not enabled", () => {
    expect(
      isDevQuickLoginAllowed({
        NODE_ENV: "development",
      }),
    ).toBe(false);
  });
});

describe("normalizeCallbackUrl", () => {
  it("keeps safe in-app paths", () => {
    expect(normalizeCallbackUrl("/project/abc")).toBe("/project/abc");
  });

  it("rejects external or malformed callback values", () => {
    expect(normalizeCallbackUrl("https://evil.com")).toBe("/");
    expect(normalizeCallbackUrl("//evil.com")).toBe("/");
    expect(normalizeCallbackUrl("project/abc")).toBe("/");
  });
});
