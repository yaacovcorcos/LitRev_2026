"use client";

import { useMemo, useState } from "react";
import type { ArtifactStatus, PlanPayload, PlanStep } from "@/types/artifacts";
import styles from "@/styles/artifacts.module.css";

export type PlanCardProps = {
    payload: PlanPayload;
    status: ArtifactStatus;
    onRun?: (selectedIndexes: number[]) => void;
    onCancel: () => void;
    canRun?: boolean;
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

export function PlanCard({ payload, status, onRun, onCancel, canRun = true }: PlanCardProps) {
    const allIndexes = useMemo(
        () => new Set(payload.steps.map((_, i) => i)),
        [payload.steps.length],
    );
    const [selected, setSelected] = useState<Set<number>>(allIndexes);

    const isProposed = status === "proposed";
    const isRunning = status === "running";
    const isExecutable = Boolean(payload.execution);

    const toggleStep = (index: number) => {
        if (!isProposed || !isExecutable) return;
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const handleRun = () => {
        if (selected.size === 0 || !onRun || !canRun || !isExecutable) return;
        onRun([...selected].sort((a, b) => a - b));
    };

    return (
        <>
            <ol className={styles.planStepList}>
                {payload.steps.map((step, i) => {
                    const isSelected = selected.has(i);
                    const stepClass = [
                        styles.planStep,
                        STEP_STYLES[step.status],
                        !isSelected && isProposed && isExecutable ? styles.planStepDeselected : "",
                    ].filter(Boolean).join(" ");

                    // When running/terminal, show execution status icon
                    // When proposed, show selection toggle
                    const showToggle = isProposed && isExecutable;

                    return (
                        <li key={i} className={stepClass}>
                            <span className={styles.planStepNumber}>{i + 1}</span>
                            <div className={styles.planStepLabel}>
                                <span>{step.label}</span>
                                {step.description && (
                                    <div className={styles.planStepDesc}>{step.description}</div>
                                )}
                            </div>
                            {showToggle ? (
                                <button
                                    type="button"
                                    className={styles.planStepToggle}
                                    onClick={() => toggleStep(i)}
                                    aria-label={isSelected ? `Deselect step ${i + 1}` : `Select step ${i + 1}`}
                                >
                                    <span className="material-icons-round">
                                        {isSelected ? "check_circle_outline" : "radio_button_unchecked"}
                                    </span>
                                </button>
                            ) : (
                                <span className={`material-icons-round ${styles.planStepIcon}`}>
                                    {STEP_ICONS[step.status]}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
            {payload.estimatedActions > 0 && (
                <div className={styles.planEstimate}>
                    ~{payload.estimatedActions} action{payload.estimatedActions !== 1 ? "s" : ""}
                </div>
            )}
            {isProposed && isExecutable && (
                <div className={styles.cardActions}>
                    <button type="button" className={styles.actionBtnGhost} onClick={onCancel}>
                        Cancel
                    </button>
                    {onRun && (
                        <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={handleRun}
                            disabled={selected.size === 0 || !canRun}
                        >
                            Run{selected.size < payload.steps.length ? ` (${selected.size}/${payload.steps.length})` : ""}
                        </button>
                    )}
                </div>
            )}
            {isProposed && !isExecutable && (
                <div className={styles.planEstimate}>
                    Advisory plan. Review only.
                </div>
            )}
            {isRunning && (
                <div className={styles.planEstimate}>
                    Executing plan...
                </div>
            )}
        </>
    );
}
