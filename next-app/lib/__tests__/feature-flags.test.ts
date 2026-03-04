import { afterEach, describe, expect, it } from "vitest";
import { isScrollOwnershipA1Enabled } from "@/lib/feature-flags";

const ORIGINAL_A1 = process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1;

describe("isScrollOwnershipA1Enabled", () => {
  afterEach(() => {
    if (typeof ORIGINAL_A1 === "undefined") {
      delete process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1;
    } else {
      process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1 = ORIGINAL_A1;
    }
  });

  it("defaults to false when unset", () => {
    delete process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1;
    expect(isScrollOwnershipA1Enabled()).toBe(false);
  });

  it("returns true for truthy values", () => {
    process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1 = "1";
    expect(isScrollOwnershipA1Enabled()).toBe(true);
  });

  it("returns false for falsy values", () => {
    process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1 = "off";
    expect(isScrollOwnershipA1Enabled()).toBe(false);
  });
});
