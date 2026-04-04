"use client";

import styles from "./ChatComposerPendingApprovalBar.module.css";

export type ChatComposerPendingApprovalBarProps = {
    pendingCount: number;
    state: "idle" | "approving" | "finished";
    progress: { completed: number; total: number };
    resultText: string;
    onApproveAll: () => void | Promise<void>;
    onStop: () => void;
    stackPosition?: "top" | "middle";
};

export function ChatComposerPendingApprovalBar({
    pendingCount,
    state,
    progress,
    resultText,
    onApproveAll,
    onStop,
    stackPosition = "top",
}: ChatComposerPendingApprovalBarProps) {
    return (
        <div className={styles.capHost}>
            <div className={styles.cap} data-stack-position={stackPosition}>
                {state === "idle" ? (
                    <div className={styles.headerRow}>
                        <div className={styles.labelGroup}>
                            <span className={`material-icons-round ${styles.headerIcon}`} aria-hidden="true">fact_check</span>
                            <div className={styles.textGroup}>
                                <span className={styles.label}>Pending approvals</span>
                                <span className={styles.meta} role="status" aria-live="polite" aria-atomic="true">
                                    {pendingCount} pending proposals
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            className={styles.primaryAction}
                            onClick={() => void onApproveAll()}
                            aria-label="Approve all pending proposals"
                        >
                            Approve all
                        </button>
                    </div>
                ) : null}

                {state === "approving" ? (
                    <div className={styles.headerRow}>
                        <div className={styles.labelGroup}>
                            <span className={`material-icons-round ${styles.spinnerIcon}`} aria-hidden="true">sync</span>
                            <div className={styles.textGroup}>
                                <span className={styles.label}>Approving proposals</span>
                                <span className={styles.meta} role="status" aria-live="polite" aria-atomic="true">
                                    Approving {progress.completed}/{progress.total}...
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            className={styles.secondaryAction}
                            onClick={onStop}
                        >
                            Stop
                        </button>
                    </div>
                ) : null}

                {state === "finished" ? (
                    <div className={styles.headerRow}>
                        <div className={styles.labelGroup}>
                            <span className={`material-icons-round ${styles.headerIcon}`} aria-hidden="true">task_alt</span>
                            <div className={styles.textGroup}>
                                <span className={styles.label}>Approval finished</span>
                                <span className={styles.meta} role="status" aria-live="polite" aria-atomic="true">
                                    {resultText}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
