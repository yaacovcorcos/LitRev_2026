/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { getEffectiveViewportHeight, setMobileViewportVars } from "@/lib/mobile/viewport";

describe("mobile viewport utilities", () => {
  it("prefers visualViewport height when available", () => {
    const win = {
      innerHeight: 900,
      visualViewport: { height: 720 },
    } as unknown as Window;

    expect(getEffectiveViewportHeight(win)).toBe(720);
  });

  it("falls back to innerHeight when visualViewport is unavailable", () => {
    const win = {
      innerHeight: 812,
    } as Window;

    expect(getEffectiveViewportHeight(win)).toBe(812);
  });

  it("sets viewport css variables", () => {
    const root = document.createElement("div");
    setMobileViewportVars(root, 700);

    expect(root.style.getPropertyValue("--app-vh")).toBe("7px");
    expect(root.style.getPropertyValue("--app-height")).toBe("700px");
  });
});
