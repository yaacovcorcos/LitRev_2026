import "server-only";

import type { RunEventType } from "@/types/agent";

export const RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES = [
    "message",
    "tool_call",
    "tool_result",
    "user_input_required",
    "user_input_resolved",
    "artifact_proposed",
    "artifact_reviewed",
    "checkpoint",
    "error",
] as const satisfies readonly RunEventType[];

export type RecoveryAuthoritativeRunEventType =
    (typeof RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES)[number];

const RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPE_SET = new Set<RunEventType>(
    RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPES,
);

export function isRecoveryAuthoritativeRunEventType(
    type: RunEventType,
): type is RecoveryAuthoritativeRunEventType {
    return RECOVERY_AUTHORITATIVE_RUN_EVENT_TYPE_SET.has(type);
}

export const DURABLE_PROGRESS_RUN_EVENT_TYPES = [
    "message",
    "tool_result",
    "user_input_required",
    "user_input_resolved",
    "artifact_proposed",
    "artifact_reviewed",
] as const satisfies readonly RunEventType[];

export type DurableProgressRunEventType =
    (typeof DURABLE_PROGRESS_RUN_EVENT_TYPES)[number];

const DURABLE_PROGRESS_RUN_EVENT_TYPE_SET = new Set<RunEventType>(
    DURABLE_PROGRESS_RUN_EVENT_TYPES,
);

export function isDurableProgressRunEventType(
    type: RunEventType,
): type is DurableProgressRunEventType {
    return DURABLE_PROGRESS_RUN_EVENT_TYPE_SET.has(type);
}
