"use client";

import type { MemoryForgetProposalPayload } from "@/types/artifacts";
import styles from "@/styles/artifacts.module.css";

export type MemoryForgetCardProps = {
    payload: MemoryForgetProposalPayload;
    onAccept: () => void;
    onReject: () => void;
};

export function MemoryForgetCard({ payload, onAccept, onReject }: MemoryForgetCardProps) {
    const label = payload.memoryType === "user" ? "User Memory" : "Project Memory";
    const icon = payload.memoryType === "user" ? "person_remove" : "folder_delete";
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

            <div className={styles.cardActions}>
                <button type="button" className={styles.excludeBtn} onClick={onReject}>
                    <span className="material-icons-round" style={{ fontSize: 14, marginRight: 4 }}>close</span>
                    Keep
                </button>
                <button type="button" className={styles.keepBtn} onClick={onAccept}>
                    <span className="material-icons-round" style={{ fontSize: 14, marginRight: 4 }}>archive</span>
                    Archive Memory
                </button>
            </div>
        </>
    );
}

