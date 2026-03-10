"use client";

import { useReportWebVitals } from "next/web-vitals";
import {
  PERFORMANCE_METRIC_NAMES,
  PERFORMANCE_METRIC_RATINGS,
  PERFORMANCE_METRIC_VERSION,
  type PerformanceMetricInput,
  type PerformanceNetwork,
  type PerformanceViewport,
} from "@/types/performance-telemetry";
import { resolvePerformanceRouteContext } from "@/lib/performance-route-context";
import { getViewportClass } from "@/lib/mobile/tiers";
import { isOperationalTelemetryE2EMode } from "@/lib/telemetry/e2e-mode";

const TELEMETRY_ENDPOINT = "/api/telemetry/performance";

function shouldShip(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof fetch !== "function") return false;
  if (isOperationalTelemetryE2EMode()) return false;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return false;
  const raw = process.env.NEXT_PUBLIC_ENABLE_PERFORMANCE_TELEMETRY;
  if (!raw) return true;
  const normalized = raw.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

function getViewport(): PerformanceViewport {
  if (typeof window === "undefined") return "unknown";
  return getViewportClass(window);
}

function getNetwork(): { network: PerformanceNetwork; online: boolean | null } {
  if (typeof navigator === "undefined") {
    return { network: "unknown", online: null };
  }

  const online = "onLine" in navigator ? navigator.onLine : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = (navigator as any).connection;
  const effectiveType = typeof connection?.effectiveType === "string"
    ? connection.effectiveType
    : "unknown";

  if (["slow-2g", "2g", "3g", "4g"].includes(effectiveType)) {
    return { network: effectiveType as PerformanceNetwork, online };
  }

  if (online === false) {
    return { network: "offline", online };
  }

  return { network: "unknown", online };
}

function getAppVersion(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_VERSION;
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

function getCommitSha(): string | null {
  const raw = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  if (raw && raw.trim().length > 0) return raw.trim();
  return null;
}

function makeEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `perf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function postMetric(input: PerformanceMetricInput): Promise<void> {
  const response = await fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Performance telemetry upload failed with status ${response.status}`);
  }
}

export function PerformanceVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!shouldShip()) return;
    if (!PERFORMANCE_METRIC_NAMES.includes(metric.name as (typeof PERFORMANCE_METRIC_NAMES)[number])) {
      return;
    }

    const rating = PERFORMANCE_METRIC_RATINGS.includes(metric.rating as (typeof PERFORMANCE_METRIC_RATINGS)[number])
      ? metric.rating
      : null;

    const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
    const routeContext = resolvePerformanceRouteContext(pathname);
    const network = getNetwork();

    const payload: PerformanceMetricInput = {
      eventId: makeEventId(),
      version: PERFORMANCE_METRIC_VERSION,
      name: metric.name as PerformanceMetricInput["name"],
      value: metric.value,
      metricId: metric.id,
      rating,
      routeTemplate: routeContext.routeTemplate,
      surface: routeContext.surface,
      projectId: routeContext.projectId,
      clientTimestamp: new Date().toISOString(),
      dimensions: {
        viewport: getViewport(),
        network: network.network,
        online: network.online,
        synthetic: false,
        appVersion: getAppVersion(),
        commitSha: getCommitSha(),
      },
    };

    void postMetric(payload).catch((error) => {
      console.warn("[performance-telemetry] failed to ship metric", error);
    });
  });

  return null;
}
