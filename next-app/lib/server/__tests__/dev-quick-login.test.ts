import { describe, expect, it } from "vitest";
import {
  buildFixtureProjectDescription,
  getDevQuickLoginIdentity,
  isDevQuickLoginAllowed,
  isSeededFixtureProject,
  normalizeCallbackUrl,
  normalizeDevQuickLoginSeedKey,
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
      }),
    ).toBe(true);
  });

  it("blocks quick login on preview/production runtime when feature flag is not enabled", () => {
    expect(
      isDevQuickLoginAllowed({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
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

describe("seeded dev quick login identity", () => {
  it("normalizes empty seeds to null", () => {
    expect(normalizeDevQuickLoginSeedKey("   ")).toBeNull();
  });

  it("derives deterministic seeded identities", () => {
    const identityA = getDevQuickLoginIdentity("mobile-home-phone");
    const identityB = getDevQuickLoginIdentity("mobile-home-phone");
    const defaultIdentity = getDevQuickLoginIdentity();

    expect(identityA).toEqual(identityB);
    expect(identityA.userId).not.toBe(defaultIdentity.userId);
    expect(identityA.workspaceId).not.toBe(defaultIdentity.workspaceId);
    expect(identityA.email).toContain("+");
  });

  it("tags fixture descriptions with the seeded namespace", () => {
    const description = buildFixtureProjectDescription("protocol-seed", "Ready fixture");
    expect(description).toMatch(/^\[e2e-fixture:[a-f0-9]{12}\] Ready fixture$/);
  });

  it("detects seeded blank and demo fixtures", () => {
    const description = buildFixtureProjectDescription("workspace-seed", "Workspace project");

    expect(
      isSeededFixtureProject(
        {
          description,
          demoKey: null,
        },
        "workspace-seed",
      ),
    ).toBe(true);

    expect(
      isSeededFixtureProject(
        {
          description: "Non fixture project",
          demoKey: "sample-yoga-anxiety",
        },
        "workspace-seed",
      ),
    ).toBe(true);

    expect(
      isSeededFixtureProject(
        {
          description: "Non fixture project",
          demoKey: null,
        },
        "workspace-seed",
      ),
    ).toBe(false);
  });
});
