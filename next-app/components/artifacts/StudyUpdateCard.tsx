"use client";

import { useCallback, useState } from "react";
import type { StudyFieldChange, StudyUpdatePayload } from "@/types/artifacts";
import styles from "@/styles/artifacts.module.css";

const PREVIEW_LIMIT = 120;

function shouldTruncate(value: string): boolean {
    return value.length > PREVIEW_LIMIT;
}

function preview(value: string): string {
    if (!shouldTruncate(value)) return value;
    return `${value.slice(0, PREVIEW_LIMIT)}...`;
}

function renderOperationLabel(operation: StudyFieldChange["operation"]): string {
    if (operation === "clear") return "Clear";
    if (operation === "append") return "Append";
    return "Set";
}

export type StudyUpdateCardProps = {
    payload: StudyUpdatePayload;
    onAccept: () => void;
    onReject: () => void;
    canAct?: boolean;
};

export function StudyUpdateCard({ payload, onAccept, onReject, canAct = true }: StudyUpdateCardProps) {
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

    const toggleRow = useCallback((key: string) => {
        setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    return (
        <>
            <div className={styles.studyUpdateHeader}>
                <div className={styles.studyUpdateTitle}>
                    Proposed edits to "{payload.studyTitle}"
                </div>
                <p className={styles.studyUpdateRationale}>
                    {payload.rationale}
                </p>
            </div>

            <div className={styles.studyUpdateTableWrapper}>
                <table className={styles.studyUpdateTable}>
                    <thead>
                        <tr>
                            <th>Field</th>
                            <th>Action</th>
                            <th>Before</th>
                            <th>After</th>
                        </tr>
                    </thead>
                    <tbody>
                        {payload.changes.map((change, idx) => {
                            const rowKey = `${change.field}-${idx}`;
                            const expanded = !!expandedRows[rowKey];
                            const before = expanded ? change.displayOld : preview(change.displayOld);
                            const after = expanded ? change.displayNew : preview(change.displayNew);
                            const needsToggle = shouldTruncate(change.displayOld) || shouldTruncate(change.displayNew);

                            return (
                                <tr key={rowKey}>
                                    <td className={styles.studyUpdateFieldCell}>
                                        <div>{change.label}</div>
                                        {needsToggle && (
                                            <button
                                                type="button"
                                                className={styles.studyUpdateToggle}
                                                onClick={() => toggleRow(rowKey)}
                                            >
                                                {expanded ? "Show less" : "Show more"}
                                            </button>
                                        )}
                                    </td>
                                    <td>{renderOperationLabel(change.operation)}</td>
                                    <td className={styles.studyUpdateValueCell}>{before}</td>
                                    <td className={styles.studyUpdateValueCell}>{after}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className={styles.cardActions}>
                <button type="button" className={styles.actionBtnGhost} onClick={onReject} disabled={!canAct}>
                    Reject
                </button>
                <button type="button" className={styles.actionBtn} onClick={onAccept} disabled={!canAct}>
                    Apply changes
                </button>
            </div>
        </>
    );
}
