"use client";

import { useState } from "react";
import type { ArtifactStatus, MemoryProposalPayload } from "@/types/artifacts";
import { getArtifactSettledLabel, isArtifactReviewable } from "@/lib/artifacts/reviewability";
import styles from "@/styles/artifacts.module.css";

export type MemoryCardProps = {
    payload: MemoryProposalPayload;
    status?: ArtifactStatus;
    onAccept: () => void;
    onReject: () => void;
    onEditAndAccept?: (edited: MemoryProposalPayload) => void;
    canAct?: boolean;
};

export function MemoryCard({ payload, status = "proposed", onAccept, onReject, onEditAndAccept, canAct = true }: MemoryCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(payload.value);
    const isReviewable = isArtifactReviewable(status);
    const settledLabel = getArtifactSettledLabel(status);

    const memoryTypeLabel = payload.memoryType === "user" ? "User Preference" : "Project Decision";
    const memoryTypeIcon = payload.memoryType === "user" ? "person" : "folder";

    const handleSaveEdit = () => {
        const trimmed = editValue.trim();
        if (!trimmed) return;
        if (onEditAndAccept) {
            onEditAndAccept({ ...payload, value: trimmed });
        }
        setIsEditing(false);
    };

    return (
        <>
            <div className={styles.memoryMeta}>
                <span className={`material-icons-round ${styles.memoryTypeIcon}`}>{memoryTypeIcon}</span>
                <span className={styles.memoryTypeLabel}>{memoryTypeLabel}</span>
            </div>

            {payload.key && (
                <div className={styles.memoryKey}>{payload.key}</div>
            )}

            {isEditing && isReviewable ? (
                <textarea
                    className={styles.inlineEdit}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                        if (e.key === "Escape") { setIsEditing(false); setEditValue(payload.value); }
                    }}
                    rows={2}
                    autoFocus
                />
            ) : (
                <div className={styles.memoryValue}>{payload.value}</div>
            )}

            {payload.rationale && (
                <div className={styles.criteriaRationale}>{payload.rationale}</div>
            )}

            {isReviewable ? (
                <div className={styles.cardActions}>
                    <button type="button" className={styles.excludeBtn} onClick={onReject} disabled={!canAct}>
                        <span className="material-icons-round" style={{ fontSize: 14, marginRight: 4 }}>close</span>
                        Dismiss
                    </button>
                    {isEditing ? (
                        <button type="button" className={styles.keepBtn} onClick={handleSaveEdit}>
                            <span className="material-icons-round" style={{ fontSize: 14, marginRight: 4 }}>check</span>
                            Save &amp; Remember
                        </button>
                    ) : (
                        <>
                            {onEditAndAccept && (
                                <button
                                    type="button"
                                    className={styles.actionBtnGhost}
                                    onClick={() => setIsEditing(true)}
                                >
                                    <span className="material-icons-round" style={{ fontSize: 14, marginRight: 4 }}>edit</span>
                                    Edit
                                </button>
                            )}
                            <button type="button" className={styles.keepBtn} onClick={onAccept} disabled={!canAct}>
                                <span className="material-icons-round" style={{ fontSize: 14, marginRight: 4 }}>check</span>
                                Remember
                            </button>
                        </>
                    )}
                </div>
            ) : settledLabel ? (
                <div className={styles.applyMeta}>{settledLabel}</div>
            ) : null}
        </>
    );
}
