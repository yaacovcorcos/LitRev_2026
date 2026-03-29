import { describe, expect, it } from "vitest";
import { normalizeRouteParam } from "@/lib/route-params";

describe("normalizeRouteParam", () => {
  it("returns a string param unchanged", () => {
    expect(normalizeRouteParam("project-1")).toBe("project-1");
  });

  it("unwraps a single route segment from an array", () => {
    expect(normalizeRouteParam(["project-1"])).toBe("project-1");
  });

  it("returns undefined when the route param is missing", () => {
    expect(normalizeRouteParam(undefined)).toBeUndefined();
  });
});
