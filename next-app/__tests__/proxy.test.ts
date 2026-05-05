import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../proxy";

function makeRequest(path: string, sessionToken?: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: sessionToken
      ? {
          cookie: `better-auth.session_token=${sessionToken}`,
        }
      : undefined,
  });
}

describe("auth proxy", () => {
  it("sends unauthenticated root entry to AI after login", () => {
    const response = proxy(makeRequest("/"));

    expect(response.headers.get("location")).toBe("http://localhost/login?callbackUrl=%2Fai");
  });

  it("preserves explicit deep links as login callbacks", () => {
    const response = proxy(makeRequest("/project/p-1/draft?mode=full"));

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?callbackUrl=%2Fproject%2Fp-1%2Fdraft%3Fmode%3Dfull",
    );
  });

  it("does not redirect authenticated requests", () => {
    const response = proxy(makeRequest("/", "session-token"));

    expect(response.headers.get("location")).toBeNull();
  });
});
