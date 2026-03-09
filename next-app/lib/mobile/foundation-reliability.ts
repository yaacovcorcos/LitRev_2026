"use client";

import { useEffect, useRef } from "react";
import { recordReliabilityMetric } from "@/lib/ai/reliability-telemetry";
import type {
  ReliabilityFlowName,
  ReliabilityLayoutMode,
  ReliabilityRouteState,
  ReliabilityRouteTemplate,
  ReliabilitySurface,
} from "@/types/reliability-telemetry";

type RouteReadyOptions = {
  enabled?: boolean;
  routeTemplate: ReliabilityRouteTemplate;
  surface: ReliabilitySurface;
  state: ReliabilityRouteState;
  layoutMode?: ReliabilityLayoutMode;
  projectId?: string | null;
};

type RouteFlowOptions = {
  routeTemplate: ReliabilityRouteTemplate;
  surface: ReliabilitySurface;
  flow: ReliabilityFlowName;
  layoutMode?: ReliabilityLayoutMode;
  projectId?: string | null;
};

export function useFoundationRouteReady({
  enabled = true,
  routeTemplate,
  surface,
  state,
  layoutMode = null,
  projectId = null,
}: RouteReadyOptions): void {
  const emittedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    const key = `${routeTemplate}:${state}:${layoutMode ?? "none"}:${projectId ?? "none"}`;
    if (emittedKeysRef.current.has(key)) return;
    emittedKeysRef.current.add(key);

    recordReliabilityMetric({
      type: "reliability.v1.route.ready",
      surface,
      projectId,
      payload: {
        routeTemplate,
        state,
        layoutMode,
      },
    });
  }, [enabled, layoutMode, projectId, routeTemplate, state, surface]);
}

export function recordFoundationRouteFlowCompleted({
  routeTemplate,
  surface,
  flow,
  layoutMode = null,
  projectId = null,
}: RouteFlowOptions): void {
  recordReliabilityMetric({
    type: "reliability.v1.route.flow_completed",
    surface,
    projectId,
    payload: {
      routeTemplate,
      flow,
      layoutMode,
    },
  });
}
