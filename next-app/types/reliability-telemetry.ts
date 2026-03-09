import type { StreamTerminalReason } from "@/lib/ai/stream-lifecycle";

export const RELIABILITY_METRIC_VERSION = 1 as const;

export type ReliabilitySurface = "ai" | "project" | "popup" | "shell" | "home" | "auth" | "protocol";
export const RELIABILITY_VIEWPORT_VALUES = ["phone", "compact", "desktop", "unknown"] as const;
export type ReliabilityViewport = (typeof RELIABILITY_VIEWPORT_VALUES)[number];
export type ReliabilityNetworkHint = "online" | "offline" | "slow" | "unknown";
export const RELIABILITY_ROUTE_TEMPLATES = [
  "/",
  "/login",
  "/signup",
  "/project/[id]",
  "/project/[id]/protocol",
  "/ai",
] as const;
export type ReliabilityRouteTemplate = (typeof RELIABILITY_ROUTE_TEMPLATES)[number];
export type ReliabilityRouteState =
  | "loading"
  | "zero_state"
  | "workspace"
  | "signin"
  | "signup"
  | "content";
export type ReliabilityLayoutMode = "embedded" | "standalone" | null;
export type ReliabilityFlowName =
  | "enter_workspace"
  | "open_sample_review"
  | "create_project"
  | "magic_link_requested";

export type ReliabilityFlagsSnapshot = {
  scrollOwnershipA1: boolean | null;
  streamReliabilityA2: boolean | null;
  mobileScrollLockV2: boolean | null;
};

export type ReliabilityDimensions = {
  viewport: ReliabilityViewport;
  network: ReliabilityNetworkHint;
  flags: ReliabilityFlagsSnapshot;
};

export type ReliabilityMetricType =
  | "reliability.v1.stream.started"
  | "reliability.v1.stream.terminal"
  | "reliability.v1.stream.stuck_watchdog_fired"
  | "reliability.v1.retry.clicked"
  | "reliability.v1.shell.session_started"
  | "reliability.v1.shell.session_ended"
  | "reliability.v1.route.ready"
  | "reliability.v1.route.flow_completed";

export type ReliabilityMetricPayloadByType = {
  "reliability.v1.stream.started": {
    requestKey: string;
    phase: "send" | "plan" | "project_stream" | "popup_stream";
  };
  "reliability.v1.stream.terminal": {
    requestKey: string;
    phase: "send" | "plan" | "project_stream" | "popup_stream";
    reason: StreamTerminalReason;
    runStatus: string | null;
  };
  "reliability.v1.stream.stuck_watchdog_fired": {
    requestKey: string;
    inactivityMs: number;
  };
  "reliability.v1.retry.clicked": {
    requestKey: string;
    source: "retry_action" | "retry_button";
  };
  "reliability.v1.shell.session_started": {
    sessionId: string;
  };
  "reliability.v1.shell.session_ended": {
    sessionId: string;
    durationMs: number;
  };
  "reliability.v1.route.ready": {
    routeTemplate: ReliabilityRouteTemplate;
    state: ReliabilityRouteState;
    layoutMode: ReliabilityLayoutMode;
  };
  "reliability.v1.route.flow_completed": {
    routeTemplate: ReliabilityRouteTemplate;
    flow: ReliabilityFlowName;
    layoutMode: ReliabilityLayoutMode;
  };
};

export type ReliabilityMetricPayload = ReliabilityMetricPayloadByType[ReliabilityMetricType];

export type ReliabilityMetricEvent = {
  eventId: string;
  version: typeof RELIABILITY_METRIC_VERSION;
  type: ReliabilityMetricType;
  surface: ReliabilitySurface;
  timestamp: string;
  projectId?: string | null;
  conversationId?: string | null;
  runId?: string | null;
  dimensions: ReliabilityDimensions;
  payload: ReliabilityMetricPayload;
};

export type ReliabilityMetricInput = {
  eventId: string;
  version: typeof RELIABILITY_METRIC_VERSION;
  type: ReliabilityMetricType;
  surface: ReliabilitySurface;
  projectId?: string | null;
  conversationId?: string | null;
  runId?: string | null;
  clientTimestamp: string;
  dimensions: ReliabilityDimensions;
  payload: ReliabilityMetricPayload;
};
