import { describe, expect, it } from "vitest";
import {
  getAuthBaseURL,
  getAuthCookieSecurityOverride,
  getAuthTrustedOrigins,
} from "@/lib/server/auth/auth-origins";

describe("auth origin configuration", () => {
  it("does not pin the server base URL to a local development port", () => {
    expect(getAuthBaseURL({
      BETTER_AUTH_URL: "http://localhost:3101",
      NEXT_PUBLIC_BETTER_AUTH_URL: "http://localhost:3000",
    })).toBe("");
  });

  it("uses deployed Better Auth URLs as the concrete base URL", () => {
    expect(getAuthBaseURL({
      BETTER_AUTH_URL: "https://www.papilab.com",
      NEXT_PUBLIC_BETTER_AUTH_URL: "https://preview.example.com",
    })).toBe("https://www.papilab.com");
  });

  it("trusts common localhost origins on any port when local auth is configured", () => {
    const origins = getAuthTrustedOrigins({
      BETTER_AUTH_URL: "http://localhost:3101",
    });

    expect(origins).toEqual(expect.arrayContaining([
      "http://localhost:3101",
      "http://localhost",
      "http://localhost:*",
      "http://127.0.0.1",
      "http://127.0.0.1:*",
      "http://[::1]",
      "http://[::1]:*",
    ]));
  });

  it("does not add local wildcard origins for deployed app origins", () => {
    const origins = getAuthTrustedOrigins({
      BETTER_AUTH_URL: "https://www.papilab.com",
      NEXT_PUBLIC_BETTER_AUTH_URL: "https://www.papilab.com",
      VERCEL_URL: "litrev2026.example.vercel.app",
    });

    expect(origins).toEqual([
      "https://www.papilab.com",
      "https://litrev2026.example.vercel.app",
    ]);
    expect(origins).not.toContain("http://localhost:*");
    expect(origins).not.toContain("http://127.0.0.1:*");
  });

  it("accepts additional comma-separated trusted origins from Better Auth env", () => {
    expect(getAuthTrustedOrigins({
      BETTER_AUTH_URL: "https://www.papilab.com",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://preview.example.com, http://localhost:3201 ",
    })).toEqual(expect.arrayContaining([
      "https://www.papilab.com",
      "https://preview.example.com",
      "http://localhost:3201",
      "http://localhost:*",
      "http://127.0.0.1:*",
    ]));
  });

  it("disables secure cookies only for the local production performance probe", () => {
    expect(getAuthCookieSecurityOverride({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      ENABLE_DEV_QUICK_LOGIN: "1",
      PERF_PROBE_INSECURE_AUTH_COOKIES: "1",
      PERF_PROBE_BASE_URL: "http://127.0.0.1:3201",
    })).toBe(false);
  });

  it("keeps secure cookie defaults outside the local performance probe", () => {
    const baseEnv = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      ENABLE_DEV_QUICK_LOGIN: "1",
      PERF_PROBE_INSECURE_AUTH_COOKIES: "1",
    };

    expect(getAuthCookieSecurityOverride({
      ...baseEnv,
      PERF_PROBE_BASE_URL: "https://preview.example.com",
    })).toBeUndefined();
    expect(getAuthCookieSecurityOverride({
      ...baseEnv,
      VERCEL_ENV: "production",
      PERF_PROBE_BASE_URL: "http://127.0.0.1:3201",
    })).toBeUndefined();
    expect(getAuthCookieSecurityOverride({
      ...baseEnv,
      ENABLE_DEV_QUICK_LOGIN: "0",
      PERF_PROBE_BASE_URL: "http://127.0.0.1:3201",
    })).toBeUndefined();
  });
});
