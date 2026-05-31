import { describe, expect, it } from "vitest";
import nextConfig, { SECURITY_HEADERS } from "../next.config";

describe("Next security headers", () => {
  it("applies the hardening headers to every route", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ]);
  });

  it("keeps the CSP compatible with the existing inline theme bootstrap", () => {
    const csp = SECURITY_HEADERS.find((header) => header.key === "Content-Security-Policy")?.value;

    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("script-src");
  });

  it("does not block LitRev voice dictation with Permissions-Policy", () => {
    const policy = SECURITY_HEADERS.find((header) => header.key === "Permissions-Policy")?.value;

    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("camera=()");
  });
});
