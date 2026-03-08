import { describe, expect, it } from "vitest";
import {
  classifyViewportWidth,
  collapseTierToViewportClass,
  getViewportClass,
  getViewportTier,
} from "../tiers";

describe("responsive viewport tiers", () => {
  it("classifies width boundaries into canonical tiers", () => {
    expect(classifyViewportWidth(0)).toBe("unknown");
    expect(classifyViewportWidth(390)).toBe("tiny-phone");
    expect(classifyViewportWidth(480)).toBe("phone");
    expect(classifyViewportWidth(767)).toBe("phone");
    expect(classifyViewportWidth(768)).toBe("compact");
    expect(classifyViewportWidth(1199)).toBe("compact");
    expect(classifyViewportWidth(1200)).toBe("wide");
    expect(classifyViewportWidth(1440)).toBe("expansive");
  });

  it("collapses tiers into telemetry viewport classes", () => {
    expect(collapseTierToViewportClass("tiny-phone")).toBe("phone");
    expect(collapseTierToViewportClass("phone")).toBe("phone");
    expect(collapseTierToViewportClass("compact")).toBe("compact");
    expect(collapseTierToViewportClass("wide")).toBe("desktop");
    expect(collapseTierToViewportClass("expansive")).toBe("desktop");
    expect(collapseTierToViewportClass("unknown")).toBe("unknown");
  });

  it("reads viewport tier and class from a window-like object", () => {
    const phoneWindow = { innerWidth: 430 } as Pick<Window, "innerWidth">;
    const compactWindow = { innerWidth: 900 } as Pick<Window, "innerWidth">;
    const wideWindow = { innerWidth: 1280 } as Pick<Window, "innerWidth">;

    expect(getViewportTier(phoneWindow)).toBe("tiny-phone");
    expect(getViewportClass(phoneWindow)).toBe("phone");
    expect(getViewportTier(compactWindow)).toBe("compact");
    expect(getViewportClass(compactWindow)).toBe("compact");
    expect(getViewportTier(wideWindow)).toBe("wide");
    expect(getViewportClass(wideWindow)).toBe("desktop");
  });
});
