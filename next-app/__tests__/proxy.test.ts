import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: mocks.getSession,
    },
  }),
}));

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
  });

  it("sends unauthenticated root entry to AI after login", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(makeRequest("/"));

    expect(response.headers.get("location")).toBe("http://localhost/login?callbackUrl=%2Fai");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("preserves explicit deep links as login callbacks", async () => {
    const response = await proxy(makeRequest("/project/p-1/draft?mode=full"));

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?callbackUrl=%2Fproject%2Fp-1%2Fdraft%3Fmode%3Dfull",
    );
  });

  it("does not redirect when Better Auth validates the session", async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: "session-1" },
      user: { id: "user-1" },
    });
    const request = makeRequest("/", "session-token");

    const response = await proxy(request);

    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: request.headers,
      query: {
        disableCookieCache: true,
        disableRefresh: true,
      },
    });
  });

  it("redirects and clears stale Better Auth cookies", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await proxy(makeRequest("/ai", "stale-session-token"));

    expect(response.headers.get("location")).toBe("http://localhost/login?callbackUrl=%2Fai");
    expect(response.headers.getSetCookie().join("\n")).toContain("better-auth.session_token=");
  });

  it("does not clear cookies or force login when session validation is temporarily unavailable", async () => {
    mocks.getSession.mockRejectedValue(new Error("database unavailable"));

    const response = await proxy(makeRequest("/ai", "session-token"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});
