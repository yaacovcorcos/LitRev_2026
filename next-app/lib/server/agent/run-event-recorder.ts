import "server-only";

import { emitEvent, type EmitEventExtras } from "@/lib/server/agent/events";
import { markRunDurabilityDegraded } from "@/lib/server/agent/run";
import type { RunEventType } from "@/types/agent";

export type RunEventDurabilityClass = "recovery_required" | "observability_only";
export type RunEventFailureMode = "strict" | "soft" | "degrade";

const OBSERVABILITY_ONLY_RUN_EVENT_TYPES = new Set<RunEventType>([
    "context_assembly",
    "memory_retrieval",
]);

function defaultFailureModeForClass(
    durabilityClass: RunEventDurabilityClass,
): RunEventFailureMode {
    return durabilityClass === "observability_only" ? "soft" : "strict";
}

export function getRunEventDurabilityClass(
    type: RunEventType,
): RunEventDurabilityClass {
    return OBSERVABILITY_ONLY_RUN_EVENT_TYPES.has(type)
        ? "observability_only"
        : "recovery_required";
}

export interface RecordRunEventParams {
    runId: string;
    type: RunEventType;
    payload: unknown;
    extras?: EmitEventExtras;
    durabilityClass?: RunEventDurabilityClass;
    failureMode?: RunEventFailureMode;
    degradationReason?: string;
    logContext?: string;
}

export interface RecordRunEventResult {
    persisted: boolean;
    degraded: boolean;
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export async function recordRunEvent(
    params: RecordRunEventParams,
): Promise<RecordRunEventResult> {
    const durabilityClass =
        params.durabilityClass ?? getRunEventDurabilityClass(params.type);
    const failureMode =
        params.failureMode ?? defaultFailureModeForClass(durabilityClass);

    try {
        await emitEvent(params.runId, params.type, params.payload, params.extras);
        return { persisted: true, degraded: false };
    } catch (error) {
        const logContext = params.logContext ?? `run-event:${params.type}`;

        if (failureMode === "soft") {
            console.warn(`[run-event-recorder] soft-failed ${logContext}`, {
                runId: params.runId,
                type: params.type,
                durabilityClass,
                error: formatError(error),
            });
            return { persisted: false, degraded: false };
        }

        if (failureMode === "degrade") {
            const degradationReason =
                params.degradationReason ?? `${params.type}_persistence_failed`;
            await markRunDurabilityDegraded(params.runId, degradationReason).catch((markError) => {
                console.error("[run-event-recorder] failed to persist degraded durability state", {
                    runId: params.runId,
                    type: params.type,
                    error: formatError(markError),
                });
            });
            console.error(`[run-event-recorder] degraded run after ${logContext}`, {
                runId: params.runId,
                type: params.type,
                durabilityClass,
                degradationReason,
                error: formatError(error),
            });
            return { persisted: false, degraded: true };
        }

        throw error;
    }
}
