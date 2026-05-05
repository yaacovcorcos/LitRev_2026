import { describe, expect, it } from "vitest";
import {
  DEFAULT_POST_LOGIN_PATH,
  buildLoginUrl,
  getCurrentLocationCallbackUrl,
  normalizePostLoginCallbackUrl,
} from "@/lib/auth-redirects";

describe("auth redirect helpers", () => {
  it("defaults unaffiliated login to the AI surface", () => {
    expect(DEFAULT_POST_LOGIN_PATH).toBe("/ai");
    expect(normalizePostLoginCallbackUrl(null)).toBe("/ai");
    expect(normalizePostLoginCallbackUrl("")).toBe("/ai");
  });

  it("preserves safe explicit deep links", () => {
    expect(normalizePostLoginCallbackUrl("/project/p-1/draft?mode=full")).toBe("/project/p-1/draft?mode=full");
  });

  it("rejects external or protocol-relative callbacks", () => {
    expect(normalizePostLoginCallbackUrl("https://example.com/project/p-1")).toBe("/ai");
    expect(normalizePostLoginCallbackUrl("//example.com/project/p-1")).toBe("/ai");
  });

  it("builds a login URL with the current location as callback", () => {
    const callbackUrl = getCurrentLocationCallbackUrl({
      pathname: "/project/p-1/draft",
      search: "?mode=full",
      hash: "#section-results",
    });

    expect(callbackUrl).toBe("/project/p-1/draft?mode=full#section-results");
    expect(buildLoginUrl(callbackUrl)).toBe(
      "/login?callbackUrl=%2Fproject%2Fp-1%2Fdraft%3Fmode%3Dfull%23section-results",
    );
  });
});
