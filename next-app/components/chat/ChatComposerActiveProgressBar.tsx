"use client";

import type { NormalizedProgressItem } from "@/lib/ai/active-progress";
import styles from "./ChatComposerActiveProgressBar.module.css";

export type ChatComposerActiveProgressBarProps = {
    activeProgress?: NormalizedProgressItem | null;
    stackPosition?: "top" | "middle";
};

export function ChatComposerActiveProgressBar({
    activeProgress = null,
    stackPosition = "top",
}: ChatComposerActiveProgressBarProps) {
    const hasProgress = Boolean(activeProgress);
    const showProgressCount = activeProgress
        && activeProgress.current != null
        && activeProgress.total != null
        && activeProgress.total > 0;
    const pct = showProgressCount
        ? Math.max(0, Math.min(100, Math.round((activeProgress.current! / activeProgress.total!) * 100)))
        : 0;

    return (
        <div
            className={`${styles.progressHost} ${hasProgress ? styles.progressHostActive : ""}`.trim()}
            aria-hidden={!hasProgress}
        >
            {activeProgress ? (
                <div
                    className={styles.progressCard}
                    data-stack-position={stackPosition}
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                >
                    <div className={styles.headerRow}>
                        <div className={styles.spinner} aria-hidden="true" />
                        <div className={styles.content}>
                            <div className={styles.message}>{activeProgress.message}</div>
                        </div>
                        {showProgressCount ? (
                            <div className={styles.meta}>
                                {activeProgress.current} of {activeProgress.total}
                            </div>
                        ) : null}
                    </div>
                    {showProgressCount ? (
                        <div
                            className={styles.progressBar}
                            role="progressbar"
                            aria-label={activeProgress.message}
                            aria-valuemin={0}
                            aria-valuemax={activeProgress.total}
                            aria-valuenow={activeProgress.current}
                        >
                            <div
                                className={styles.progressBarFill}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
