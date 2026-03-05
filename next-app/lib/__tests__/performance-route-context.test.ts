import { describe, expect, it } from "vitest";
import { resolvePerformanceRouteContext } from "@/lib/performance-route-context";

describe("resolvePerformanceRouteContext", () => {
  it("maps home and ai routes", () => {
    expect(resolvePerformanceRouteContext("/")).toEqual({
      routeTemplate: "/",
      surface: "home",
      projectId: null,
    });

    expect(resolvePerformanceRouteContext("/ai")).toEqual({
      routeTemplate: "/ai",
      surface: "ai",
      projectId: null,
    });
  });

  it("maps project routes to sanitized templates", () => {
    expect(resolvePerformanceRouteContext("/project/abc")).toEqual({
      routeTemplate: "/project/[id]",
      surface: "project_conversation",
      projectId: "abc",
    });

    expect(resolvePerformanceRouteContext("/project/abc/ledger")).toEqual({
      routeTemplate: "/project/[id]/ledger",
      surface: "project_ledger",
      projectId: "abc",
    });

    expect(resolvePerformanceRouteContext("/project/abc/ledger/study-123")).toEqual({
      routeTemplate: "/project/[id]/ledger",
      surface: "project_ledger",
      projectId: "abc",
    });
  });

  it("falls back to /other for unknown routes", () => {
    expect(resolvePerformanceRouteContext("/random/path")).toEqual({
      routeTemplate: "/other",
      surface: "other",
      projectId: null,
    });
  });
});
