"use client";

import type { ArtifactStatus, StudyDeletionPayload } from "@/types/artifacts";
import styles from "@/styles/artifacts.module.css";

export type StudyDeletionCardProps = {
    payload: StudyDeletionPayload;
    status?: ArtifactStatus;
    onAccept: () => void;
    onReject: () => void;
    canAct?: boolean;
};

export function StudyDeletionCard({
    payload,
    status = "proposed",
    onAccept,
    onReject,
    canAct = true,
}: StudyDeletionCardProps) {
    return (
        <>
            <div className={styles.studyUpdateHeader}>
                <div className={styles.studyUpdateTitle}>
                    Remove &ldquo;{payload.title}&rdquo; from the active ledger?
                </div>
                <p className={styles.studyUpdateRationale}>
                    {payload.reason?.trim() || "This is a reversible soft deletion."}
                </p>
            </div>

            {status === "proposed" ? (
                <div className={styles.cardActions}>
                    <button type="button" className={styles.actionBtnGhost} onClick={onReject} disabled={!canAct}>
                        Keep study
                    </button>
                    <button type="button" className={styles.actionBtn} onClick={onAccept} disabled={!canAct}>
                        Delete study
                    </button>
                </div>
            ) : null}
        </>
    );
}
