"use client";

import styles from "@/styles/artifacts.module.css";

export type StreamingProgressProps = {
    message: string;
    current?: number;
    total?: number;
};

export function StreamingProgress({ message, current, total }: StreamingProgressProps) {
    const hasProgress = current != null && total != null && total > 0;
    const pct = hasProgress ? Math.round((current / total) * 100) : 0;

    return (
        <div className={styles.progressItem}>
            <div className={styles.progressSpinner} />
            <div className={styles.progressMessage}>
                {message}
                {hasProgress && (
                    <>
                        <div className={styles.progressBarOuter}>
                            <div
                                className={styles.progressBarInner}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
