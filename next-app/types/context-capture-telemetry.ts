import type { ContextCaptureActionId, ContextCaptureLaunchMode, ContextCaptureSurface, ContextCaptureTargetKind } from "./context-capture";

export const CONTEXT_CAPTURE_METRIC_VERSION = 1;

export type ContextCaptureMetricType =
    | "context_capture_opened"
    | "context_capture_sent"
    | "context_capture_reused"
    | "context_capture_removed"
    | "context_capture_scope_mismatch"
    | "context_capture_action_failed";

export type ContextCaptureMetricPayload = {
    surface: ContextCaptureSurface;
    targetKinds: ContextCaptureTargetKind[];
    actionId?: ContextCaptureActionId | null;
    launchMode?: ContextCaptureLaunchMode | "fallback_prefill" | null;
    reason?: string | null;
};

export type ContextCaptureMetricEvent = {
    eventId: string;
    version: number;
    timestamp: string;
    type: ContextCaptureMetricType;
    projectId: string | null;
    payload: ContextCaptureMetricPayload;
};

export type ContextCaptureMetricInput = {
    eventId: string;
    version: number;
    type: ContextCaptureMetricType;
    projectId: string | null;
    clientTimestamp: string;
    payload: ContextCaptureMetricPayload;
};

