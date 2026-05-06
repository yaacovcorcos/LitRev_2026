import { describe, expect, it } from "vitest";
import { formatMagicLinkCallbackError } from "@/lib/auth-errors";

describe("auth error formatting", () => {
  it("formats known Better Auth magic-link callback errors", () => {
    expect(formatMagicLinkCallbackError("EXPIRED_TOKEN")).toContain("expired");
    expect(formatMagicLinkCallbackError("failed_to_create_session")).toContain("start your session");
  });

  it("keeps unknown callback errors visible instead of silently dropping them", () => {
    expect(formatMagicLinkCallbackError("new_provider_error")).toBe(
      "We could not complete sign-in. Please send a new magic link.",
    );
  });

  it("returns null when there is no callback error", () => {
    expect(formatMagicLinkCallbackError(null)).toBeNull();
  });
});
