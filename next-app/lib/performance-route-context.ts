import type { PerformanceRouteTemplate, PerformanceSurface } from "@/types/performance-telemetry";

export type PerformanceRouteContext = {
  routeTemplate: PerformanceRouteTemplate;
  surface: PerformanceSurface;
  projectId: string | null;
};

const PROJECT_ROUTE_RE = /^\/project\/([^/]+)(?:\/(protocol|ledger|draft|notes)(?:\/.*)?)?\/?$/;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolvePerformanceRouteContext(pathname: string): PerformanceRouteContext {
  if (!pathname || pathname === "/") {
    return {
      routeTemplate: "/",
      surface: "home",
      projectId: null,
    };
  }

  if (pathname === "/ai" || pathname.startsWith("/ai/")) {
    return {
      routeTemplate: "/ai",
      surface: "ai",
      projectId: null,
    };
  }

  const match = pathname.match(PROJECT_ROUTE_RE);
  if (match) {
    const projectId = safeDecode(match[1]);
    const section = match[2] ?? null;
    if (section === "protocol") {
      return {
        routeTemplate: "/project/[id]/protocol",
        surface: "project_protocol",
        projectId,
      };
    }
    if (section === "ledger") {
      return {
        routeTemplate: "/project/[id]/ledger",
        surface: "project_ledger",
        projectId,
      };
    }
    if (section === "draft") {
      return {
        routeTemplate: "/project/[id]/draft",
        surface: "project_draft",
        projectId,
      };
    }
    if (section === "notes") {
      return {
        routeTemplate: "/project/[id]/notes",
        surface: "project_notes",
        projectId,
      };
    }
    return {
      routeTemplate: "/project/[id]",
      surface: "project_conversation",
      projectId,
    };
  }

  return {
    routeTemplate: "/other",
    surface: "other",
    projectId: null,
  };
}
