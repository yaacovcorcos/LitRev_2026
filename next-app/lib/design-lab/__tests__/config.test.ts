import { describe, expect, it } from "vitest";
import {
  getDesignLabSurface,
  sanitizeDesignLabDensity,
  sanitizeDesignLabState,
  sanitizeDesignLabViewport,
} from "../config";

describe("design lab config", () => {
  it("sanitizes viewport values", () => {
    expect(sanitizeDesignLabViewport("tablet")).toBe("tablet");
    expect(sanitizeDesignLabViewport("weird")).toBe("desktop");
    expect(sanitizeDesignLabViewport(null)).toBe("desktop");
  });

  it("sanitizes state and density values", () => {
    expect(sanitizeDesignLabState("focused")).toBe("focused");
    expect(sanitizeDesignLabState("busy")).toBe("default");
    expect(sanitizeDesignLabDensity("compact")).toBe("compact");
    expect(sanitizeDesignLabDensity("dense")).toBe("comfortable");
  });

  it("looks up valid surfaces", () => {
    expect(getDesignLabSurface("ledger")?.title).toBe("Evidence Ledger");
    expect(getDesignLabSurface("missing")).toBeNull();
  });
});
