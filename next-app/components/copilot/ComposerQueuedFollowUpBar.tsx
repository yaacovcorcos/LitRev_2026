"use client";

import type { QueuedFollowUp } from "@/types/queued-followup";
import styles from "./ComposerQueuedFollowUpBar.module.css";

export type ComposerQueuedFollowUpBarProps = {
    queuedFollowUp?: QueuedFollowUp | null;
    onEdit?: () => void;
    onRemove?: () => void;
};

export function ComposerQueuedFollowUpBar({
    queuedFollowUp = null,
    onEdit,
    onRemove,
}: ComposerQueuedFollowUpBarProps) {
    if (!queuedFollowUp) return null;

    return (
        <div className={styles.capHost}>
            <div className={styles.cap} role="status" aria-live="polite" aria-atomic="true">
                <div className={styles.headerRow}>
                    <span className={`material-icons-round ${styles.headerIcon}`} aria-hidden="true">subdirectory_arrow_right</span>
                    <span className={styles.label}>Queued next message</span>
                    <div className={styles.actions}>
                        <button type="button" className={styles.actionBtn} onClick={onEdit}>
                            Edit
                        </button>
                        <button type="button" className={styles.actionBtn} onClick={onRemove}>
                            Remove
                        </button>
                    </div>
                </div>
                <div className={styles.preview}>{queuedFollowUp.text}</div>
            </div>
        </div>
    );
}
