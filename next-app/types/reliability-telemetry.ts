import type { StreamTerminalReason } from "@/lib/ai/stream-lifecycle";

export const RELIABILITY_METRIC_VERSION = 1 as const;

export const RELIABILITY_SURFACE_VALUES = [
  "ai",
  "project",
  "popup",
  "shell",
  "home",
  "auth",
  "protocol",
] as const;
export type ReliabilitySurface = (typeof RELIABILITY_SURFACE_VALUES)[number];
export const RELIABILITY_VIEWPORT_VALUES = ["phone", "compact", "desktop", "unknown"] as const;
export type ReliabilityViewport = (typeof RELIABILITY_VIEWPORT_VALUES)[number];
export const RELIABILITY_NETWORK_VALUES = ["online", "offline", "slow", "unknown"] as const;
export type ReliabilityNetworkHint = (typeof RELIABILITY_NETWORK_VALUES)[number];
export const RELIABILITY_ROUTE_TEMPLATES = [
  "/",
  "/login",
  "/signup",
  "/project/[id]",
  "/project/[id]/protocol",
  "/ai",
] as const;
export type ReliabilityRouteTemplate = (typeof RELIABILITY_ROUTE_TEMPLATES)[number];
export const RELIABILITY_ROUTE_STATE_VALUES = [
  "loading",
  "zero_state",
  "workspace",
  "signin",
  "signup",
  "content",
] as const;
export type ReliabilityRouteState = (typeof RELIABILITY_ROUTE_STATE_VALUES)[number];
export const RELIABILITY_LAYOUT_MODE_VALUES = ["embedded", "standalone"] as const;
export type ReliabilityLayoutMode = (typeof RELIABILITY_LAYOUT_MODE_VALUES)[number] | null;
export const RELIABILITY_FLOW_VALUES = [
  "enter_workspace",
  "open_sample_review",
  "create_project",
  "magic_link_requested",
] as const;
export type ReliabilityFlowName = (typeof RELIABILITY_FLOW_VALUES)[number];
export const RELIABILITY_STREAM_PHASE_VALUES = [
  "send",
  "plan",
  "project_stream",
  "popup_stream",
] as const;
export const RELIABILITY_STREAM_TERMINAL_REASON_VALUES = [
  "completed",
  "paused_for_input",
  "cancelled_by_user",
  "failed_interrupted",
  "failed_network",
  "failed_server",
  "timed_out",
] as const satisfies readonly StreamTerminalReason[];
export const RELIABILITY_RETRY_SOURCE_VALUES = ["retry_action", "retry_button"] as const;
export const RELIABILITY_DEAD_SCROLL_INPUT_VALUES = ["wheel", "touch"] as const;
export const RELIABILITY_SHELL_MODE_VALUES = ["conversation", "view"] as const;

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

export const RELIABILITY_METRIC_TYPE_VALUES = [
  "reliability.v1.stream.started",
  "reliability.v1.stream.terminal",
  "reliability.v1.stream.stuck_watchdog_fired",
  "reliability.v1.retry.clicked",
  "reliability.v1.shell.session_started",
  "reliability.v1.shell.session_ended",
  "reliability.v1.shell.dead_scroll_detected",
  "reliability.v1.route.ready",
  "reliability.v1.route.flow_completed",
] as const;
export type ReliabilityMetricType = (typeof RELIABILITY_METRIC_TYPE_VALUES)[number];

export type ReliabilityMetricPayloadByType = {
  "reliability.v1.stream.started": {
    requestKey: string;
    phase: (typeof RELIABILITY_STREAM_PHASE_VALUES)[number];
  };
  "reliability.v1.stream.terminal": {
    requestKey: string;
    phase: (typeof RELIABILITY_STREAM_PHASE_VALUES)[number];
    reason: (typeof RELIABILITY_STREAM_TERMINAL_REASON_VALUES)[number];
    runStatus: string | null;
  };
  "reliability.v1.stream.stuck_watchdog_fired": {
    requestKey: string;
    inactivityMs: number;
  };
  "reliability.v1.retry.clicked": {
    requestKey: string;
    source: (typeof RELIABILITY_RETRY_SOURCE_VALUES)[number];
  };
  "reliability.v1.shell.session_started": {
    sessionId: string;
  };
  "reliability.v1.shell.session_ended": {
    sessionId: string;
    durationMs: number;
  };
  "reliability.v1.shell.dead_scroll_detected": {
    sessionId: string;
    input: (typeof RELIABILITY_DEAD_SCROLL_INPUT_VALUES)[number];
    blockedDurationMs: number;
    shellMode: (typeof RELIABILITY_SHELL_MODE_VALUES)[number];
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

type ReliabilityMetricScope = {
  projectId?: string | null;
  conversationId?: string | null;
  runId?: string | null;
};

type ReliabilityMetricContextByType = {
  [TType in ReliabilityMetricType]: TType extends "reliability.v1.shell.dead_scroll_detected"
    ? ReliabilityMetricScope & { surface: "shell"; projectId: string }
    : ReliabilityMetricScope & { surface: ReliabilitySurface };
};

export type ReliabilityMetricDraft = {
  [TType in ReliabilityMetricType]: ReliabilityMetricContextByType[TType] & {
    type: TType;
    payload: ReliabilityMetricPayloadByType[TType];
  };
}[ReliabilityMetricType];

export type ReliabilityMetricEvent = ReliabilityMetricDraft & {
  eventId: string;
  version: typeof RELIABILITY_METRIC_VERSION;
  timestamp: string;
  dimensions: ReliabilityDimensions;
};

export type ReliabilityMetricInput = ReliabilityMetricDraft & {
  eventId: string;
  version: typeof RELIABILITY_METRIC_VERSION;
  clientTimestamp: string;
  dimensions: ReliabilityDimensions;
};
