import { describe, expect, it } from "vitest";
import { safeEqualSecret } from "@/lib/server/security/safe-equal-secret";

describe("safeEqualSecret", () => {
  it("returns true for identical secrets", () => {
    expect(safeEqualSecret("super-secret-value", "super-secret-value")).toBe(true);
  });

  it("returns false for different secrets", () => {
    expect(safeEqualSecret("super-secret-value", "other-secret-value")).toBe(false);
  });

  it("returns false when either input is empty", () => {
    expect(safeEqualSecret("", "super-secret-value")).toBe(false);
    expect(safeEqualSecret("super-secret-value", "")).toBe(false);
  });
});
