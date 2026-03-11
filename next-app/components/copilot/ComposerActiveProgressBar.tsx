"use client";

import type { NormalizedProgressItem } from "@/lib/ai/active-progress";
import styles from "./ComposerActiveProgressBar.module.css";

export type ComposerActiveProgressBarProps = {
    activeProgress?: NormalizedProgressItem | null;
};

export function ComposerActiveProgressBar({ activeProgress = null }: ComposerActiveProgressBarProps) {
    const hasProgress = Boolean(activeProgress);
    const showProgressCount = activeProgress
        && activeProgress.current != null
        && activeProgress.total != null
        && activeProgress.total > 0;

    return (
        <div
            className={`${styles.progressHost} ${hasProgress ? styles.progressHostActive : ""}`.trim()}
            aria-hidden={!hasProgress}
        >
            {activeProgress ? (
                <div className={styles.progressCard} role="status" aria-live="polite">
                    <div className={styles.spinner} aria-hidden="true" />
                    <div className={styles.content}>
                        <div className={styles.message}>{activeProgress.message}</div>
                        {showProgressCount ? (
                            <div className={styles.meta}>
                                {activeProgress.current} / {activeProgress.total}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
