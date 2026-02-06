"use client";

import type { PlanPayload, PlanStep } from "@/types/artifacts";
import styles from "@/styles/artifacts.module.css";

export type PlanCardProps = {
    payload: PlanPayload;
    onRun: () => void;
    onCancel: () => void;
};

const STEP_ICONS: Record<PlanStep["status"], string> = {
    pending: "radio_button_unchecked",
    running: "pending",
    completed: "check_circle",
    failed: "error",
    skipped: "remove_circle_outline",
};

const STEP_STYLES: Record<PlanStep["status"], string> = {
    pending: "",
    running: "",
    completed: styles.planStepCompleted,
    failed: styles.planStepFailed,
    skipped: "",
};

export function PlanCard({ payload, onRun, onCancel }: PlanCardProps) {
    return (
        <>
            <ol className={styles.planStepList}>
                {payload.steps.map((step, i) => (
                    <li key={i} className={`${styles.planStep} ${STEP_STYLES[step.status]}`}>
                        <span className={styles.planStepNumber}>{i + 1}</span>
                        <div className={styles.planStepLabel}>
                            <span>{step.label}</span>
                            {step.description && (
                                <div className={styles.planStepDesc}>{step.description}</div>
                            )}
                        </div>
                        <span className={`material-icons-round ${styles.planStepIcon}`}>
                            {STEP_ICONS[step.status]}
                        </span>
                    </li>
                ))}
            </ol>
            {payload.estimatedActions > 0 && (
                <div className={styles.planEstimate}>
                    ~{payload.estimatedActions} action{payload.estimatedActions !== 1 ? "s" : ""}
                </div>
            )}
            <div className={styles.cardActions}>
                <button type="button" className={styles.actionBtnGhost} onClick={onCancel}>
                    Cancel
                </button>
                <button type="button" className={styles.actionBtn} onClick={onRun}>
                    Run
                </button>
            </div>
        </>
    );
}
