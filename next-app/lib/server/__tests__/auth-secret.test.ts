import { describe, expect, it } from "vitest";
import { getBetterAuthSecret } from "@/lib/server/auth/auth-secret";

describe("getBetterAuthSecret", () => {
  const env = process.env as Record<string, string | undefined>;

  it("returns configured secret when present", () => {
    const previousSecret = env.BETTER_AUTH_SECRET;
    const previousNodeEnv = env.NODE_ENV;

    env.BETTER_AUTH_SECRET = "configured-secret";
    env.NODE_ENV = "production";

    expect(getBetterAuthSecret()).toBe("configured-secret");

    env.BETTER_AUTH_SECRET = previousSecret;
    env.NODE_ENV = previousNodeEnv;
  });

  it("returns deterministic fallback in non-production env", () => {
    const previousSecret = env.BETTER_AUTH_SECRET;
    const previousNodeEnv = env.NODE_ENV;

    delete env.BETTER_AUTH_SECRET;
    env.NODE_ENV = "development";

    expect(getBetterAuthSecret()).toBe("litrev-dev-only-better-auth-secret");

    env.BETTER_AUTH_SECRET = previousSecret;
    env.NODE_ENV = previousNodeEnv;
  });

  it("throws when missing in production", () => {
    const previousSecret = env.BETTER_AUTH_SECRET;
    const previousNodeEnv = env.NODE_ENV;

    delete env.BETTER_AUTH_SECRET;
    env.NODE_ENV = "production";

    expect(() => getBetterAuthSecret()).toThrow(
      "BETTER_AUTH_SECRET is required in production.",
    );

    env.BETTER_AUTH_SECRET = previousSecret;
    env.NODE_ENV = previousNodeEnv;
  });
});
