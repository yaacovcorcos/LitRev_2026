import "server-only";

import type {
    RunAbnormalEndClassification,
    RunDurabilityState,
    RunFinalizationState,
    RunStatus,
} from "@/types/agent";
import type { RunRecoveryRecommendation } from "@/types/ai";

export interface RunConvergenceSnapshot {
    status: RunStatus;
    lastActivityAt: Date;
    lastDurableProgressAt: Date;
    durabilityState: RunDurabilityState;
    durabilityDegradedReason: string | null;
    finalizationState: RunFinalizationState;
    abnormalEndClassification: RunAbnormalEndClassification | null;
}

export interface RunConvergenceAssessment {
    activityStale: boolean;
    durableProgressStale: boolean;
    noForwardDurableProgress: boolean;
    durabilityDegraded: boolean;
    abnormalEndClassification: RunAbnormalEndClassification | null;
    recoveryRecommendation: RunRecoveryRecommendation;
}

const USER_ACTION_CLASSIFICATIONS = new Set<RunAbnormalEndClassification>([
    "finalization_failed",
    "recovery_required_persistence_failed",
    "no_forward_durable_progress",
]);

export function assessRunConvergence(
    snapshot: RunConvergenceSnapshot,
    now: Date,
    staleMs: number,
): RunConvergenceAssessment {
    if (snapshot.status !== "running") {
        return {
            activityStale: false,
            durableProgressStale: false,
            noForwardDurableProgress: false,
            durabilityDegraded: false,
            abnormalEndClassification: snapshot.abnormalEndClassification,
            recoveryRecommendation: "retry",
        };
    }

    const staleCutoff = now.getTime() - staleMs;
    const activityStale = snapshot.lastActivityAt.getTime() < staleCutoff;
    const durableProgressStale =
        snapshot.lastDurableProgressAt.getTime() < staleCutoff;
    const durabilityDegraded = snapshot.durabilityState === "degraded";
    const noForwardDurableProgress =
        !activityStale &&
        durableProgressStale &&
        snapshot.finalizationState !== "in_progress";
    const abnormalEndClassification =
        snapshot.abnormalEndClassification ??
        (durabilityDegraded ? "recovery_required_persistence_failed" : null) ??
        (noForwardDurableProgress ? "no_forward_durable_progress" : null);

    if (activityStale) {
        return {
            activityStale,
            durableProgressStale,
            noForwardDurableProgress,
            durabilityDegraded,
            abnormalEndClassification,
            recoveryRecommendation: "stop_and_retry",
        };
    }

    if (
        durabilityDegraded ||
        snapshot.finalizationState === "failed" ||
        (abnormalEndClassification &&
            USER_ACTION_CLASSIFICATIONS.has(abnormalEndClassification))
    ) {
        return {
            activityStale,
            durableProgressStale,
            noForwardDurableProgress,
            durabilityDegraded,
            abnormalEndClassification,
            recoveryRecommendation: "stop_and_retry",
        };
    }

    return {
        activityStale,
        durableProgressStale,
        noForwardDurableProgress,
        durabilityDegraded,
        abnormalEndClassification,
        recoveryRecommendation: "reconnect",
    };
}
