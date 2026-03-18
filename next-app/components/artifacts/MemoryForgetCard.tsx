"use client";

import type { ArtifactStatus, MemoryForgetProposalPayload } from "@/types/artifacts";
import { getArtifactSettledLabel, isArtifactReviewable } from "@/lib/artifacts/reviewability";
import styles from "@/styles/artifacts.module.css";

export type MemoryForgetCardProps = {
    payload: MemoryForgetProposalPayload;
    status?: ArtifactStatus;
    onAccept: () => void;
    onReject: () => void;
    canAct?: boolean;
};

export function MemoryForgetCard({ payload, status = "proposed", onAccept, onReject, canAct = true }: MemoryForgetCardProps) {
    const label = payload.memoryType === "user" ? "User Memory" : "Project Memory";
    const icon = payload.memoryType === "user" ? "person_remove" : "folder_delete";
    const isReviewable = isArtifactReviewable(status);
    const settledLabel = getArtifactSettledLabel(status);
    return (
        <>
            <div className={styles.memoryMeta}>
                <span className={`material-icons-round ${styles.memoryTypeIcon}`}>{icon}</span>
                <span className={styles.memoryTypeLabel}>Forget {label}</span>
            </div>

            <div className={styles.memoryKey}>{payload.key}</div>

            <div className={styles.memoryValue}>
                {payload.matches.length} matching memor{payload.matches.length === 1 ? "y" : "ies"} will be archived.
            </div>

            <div className={styles.memoryTags}>
                {payload.matches.slice(0, 5).map((match) => (
                    <span key={match.id} className={styles.tag}>
                        {match.label}: {match.value}
                    </span>
                ))}
            </div>

            {payload.reason && (
                <div className={styles.criteriaRationale}>{payload.reason}</div>
            )}

            {isReviewable ? (
                <div className={styles.cardActions}>
                    <button type="button" className={styles.excludeBtn} onClick={onReject} disabled={!canAct}>
                        <span className="material-icons-round" style={{ fontSize: 14, marginRight: 4 }}>close</span>
                        Keep
                    </button>
                    <button type="button" className={styles.keepBtn} onClick={onAccept} disabled={!canAct}>
                        <span className="material-icons-round" style={{ fontSize: 14, marginRight: 4 }}>archive</span>
                        Archive Memory
                    </button>
                </div>
            ) : settledLabel ? (
                <div className={styles.applyMeta}>{settledLabel}</div>
            ) : null}
        </>
    );
}
