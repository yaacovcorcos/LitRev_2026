export const PERFORMANCE_METRIC_VERSION = 1 as const;

export const PERFORMANCE_METRIC_NAMES = ["LCP", "INP", "CLS", "TTFB", "FCP"] as const;
export type PerformanceMetricName = (typeof PERFORMANCE_METRIC_NAMES)[number];

export const PERFORMANCE_METRIC_RATINGS = ["good", "needs-improvement", "poor"] as const;
export type PerformanceMetricRating = (typeof PERFORMANCE_METRIC_RATINGS)[number];

export const PERFORMANCE_SURFACES = [
  "home",
  "project_conversation",
  "project_protocol",
  "project_ledger",
  "project_draft",
  "project_notes",
  "ai",
  "other",
] as const;
export type PerformanceSurface = (typeof PERFORMANCE_SURFACES)[number];

export const PERFORMANCE_ROUTE_TEMPLATES = [
  "/",
  "/project/[id]",
  "/project/[id]/protocol",
  "/project/[id]/ledger",
  "/project/[id]/draft",
  "/project/[id]/notes",
  "/ai",
  "/other",
] as const;
export type PerformanceRouteTemplate = (typeof PERFORMANCE_ROUTE_TEMPLATES)[number];

export const PERFORMANCE_VIEWPORT_VALUES = ["mobile", "desktop", "unknown"] as const;
export type PerformanceViewport = (typeof PERFORMANCE_VIEWPORT_VALUES)[number];

export const PERFORMANCE_NETWORK_VALUES = [
  "offline",
  "slow-2g",
  "2g",
  "3g",
  "4g",
  "unknown",
] as const;
export type PerformanceNetwork = (typeof PERFORMANCE_NETWORK_VALUES)[number];

export type PerformanceMetricInput = {
  eventId: string;
  version: typeof PERFORMANCE_METRIC_VERSION;
  name: PerformanceMetricName;
  value: number;
  metricId: string;
  rating: PerformanceMetricRating | null;
  routeTemplate: PerformanceRouteTemplate;
  surface: PerformanceSurface;
  projectId: string | null;
  clientTimestamp: string;
  dimensions: {
    viewport: PerformanceViewport;
    network: PerformanceNetwork;
    online: boolean | null;
    synthetic: boolean;
    appVersion: string | null;
    commitSha: string | null;
  };
};
