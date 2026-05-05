import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends unauthenticated root entry to AI after login", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(makeRequest("/"));

    expect(response.headers.get("location")).toBe("http://localhost/login?callbackUrl=%2Fai");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves explicit deep links as login callbacks", async () => {
    const response = await proxy(makeRequest("/project/p-1/draft?mode=full"));

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?callbackUrl=%2Fproject%2Fp-1%2Fdraft%3Fmode%3Dfull",
    );
  });

  it("does not redirect when Better Auth validates the session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        session: { id: "session-1" },
        user: { id: "user-1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(makeRequest("/", "session-token"));

    expect(response.headers.get("location")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost/api/auth/get-session?disableCookieCache=true&disableRefresh=true"),
      expect.objectContaining({
        method: "GET",
        headers: { cookie: "better-auth.session_token=session-token" },
        cache: "no-store",
      }),
    );
  });

  it("redirects and clears stale Better Auth cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(null));
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(makeRequest("/ai", "stale-session-token"));

    expect(response.headers.get("location")).toBe("http://localhost/login?callbackUrl=%2Fai");
    expect(response.headers.getSetCookie().join("\n")).toContain("better-auth.session_token=");
  });
});
