/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { getEffectiveViewportHeight, getKeyboardInset, setMobileViewportVars } from "@/lib/mobile/viewport";

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
    setMobileViewportVars(root, 700, 280);

    expect(root.style.getPropertyValue("--app-vh")).toBe("7px");
    expect(root.style.getPropertyValue("--app-height")).toBe("700px");
    expect(root.style.getPropertyValue("--keyboard-inset")).toBe("280px");
  });

  it("detects meaningful keyboard inset from the visual viewport", () => {
    const win = {
      innerHeight: 900,
      visualViewport: { height: 560, offsetTop: 0 },
    } as unknown as Window;

    expect(getKeyboardInset(win)).toBe(340);
  });

  it("ignores small browser chrome viewport differences", () => {
    const win = {
      innerHeight: 900,
      visualViewport: { height: 860, offsetTop: 0 },
    } as unknown as Window;

    expect(getKeyboardInset(win)).toBe(0);
  });
});
