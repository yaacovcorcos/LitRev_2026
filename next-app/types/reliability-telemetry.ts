import type { StreamTerminalReason } from "@/lib/ai/stream-lifecycle";

export const RELIABILITY_METRIC_VERSION = 1 as const;

export type ReliabilitySurface = "ai" | "project" | "popup" | "shell";
export const RELIABILITY_VIEWPORT_VALUES = ["phone", "compact", "desktop", "unknown"] as const;
export type ReliabilityViewport = (typeof RELIABILITY_VIEWPORT_VALUES)[number];
export type ReliabilityNetworkHint = "online" | "offline" | "slow" | "unknown";

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
  | "reliability.v1.shell.session_ended";

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
