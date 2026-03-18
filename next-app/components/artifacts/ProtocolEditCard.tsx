"use client";

import { useState } from "react";
import styles from "@/styles/artifacts.module.css";
import type { ArtifactStatus, ProtocolSuggestionPayload } from "@/types/artifacts";
import { getArtifactSettledLabel, isArtifactReviewable } from "@/lib/artifacts/reviewability";
import { getFieldLabel, isArrayField } from "@/lib/protocol-fields";

function formatValue(value: unknown): string {
    if (value == null || value === "") return "\u2014";
    if (Array.isArray(value)) {
        return value.length === 0 ? "\u2014" : value.join(", ");
    }
    return String(value);
}

export type ProtocolEditCardProps = {
    payload: ProtocolSuggestionPayload;
    status?: ArtifactStatus;
    /** Accept the artifact. If the user edited the value, `editedValue` is the new value; otherwise undefined. */
    onAccept: (editedValue?: string | string[]) => void;
    onDiscuss?: () => void;
    canAct?: boolean;
};

export function ProtocolEditCard({ payload, status = "proposed", onAccept, onDiscuss, canAct = true }: ProtocolEditCardProps) {
    const { field, value, oldValue, rationale } = payload;
    const label = getFieldLabel(field);
    const arrayField = isArrayField(field);
    const isReviewable = isArtifactReviewable(status);
    const settledLabel = getArtifactSettledLabel(status);

    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(() =>
        arrayField && Array.isArray(value) ? value.join("\n") : String(value ?? "")
    );
    // Track whether the user has actually modified the proposed value
    const [hasEdited, setHasEdited] = useState(false);

    const parseEditValue = (): string | string[] => {
        const trimmed = editValue.trim();
        if (arrayField) {
            return trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
        }
        return trimmed;
    };

    const commitEdit = () => {
        // For string fields, require non-empty; for array fields, allow clearing all items
        if (!arrayField && !editValue.trim()) return;
        setHasEdited(true);
        setEditing(false);
    };

    const cancelEdit = () => {
        setEditing(false);
        setEditValue(
            arrayField && Array.isArray(value) ? value.join("\n") : String(value ?? "")
        );
        // Don't reset hasEdited — if they edited before and cancel, we still consider it edited
        // unless they reverted to the original value, which we check on accept
    };

    const handleAccept = () => {
        if (hasEdited) {
            const editedVal = parseEditValue();
            // Only pass edited value if it actually differs from the original proposal
            const originalStr = arrayField && Array.isArray(value) ? value.join("\n") : String(value ?? "");
            if (editValue.trim() !== originalStr) {
                onAccept(editedVal);
                return;
            }
        }
        onAccept();
    };

    // Determine the display value — use edited if modified, otherwise original
    const displayValue = hasEdited ? parseEditValue() : value;

    return (
        <>
            <div className={styles.picoGrid}>
                <div className={styles.picoField}>
                    <span className={styles.picoFieldLabel}>{label}</span>

                    {/* Old value (struck through) */}
                    {oldValue != null && formatValue(oldValue) !== "\u2014" && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0" }}>
                            {arrayField && Array.isArray(oldValue) ? (
                                <ul style={{ margin: 0, paddingLeft: 16 }}>
                                    {(oldValue as string[]).map((item, i) => (
                                        <li key={i} style={{ textDecoration: "line-through", opacity: 0.6 }}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <span style={{ textDecoration: "line-through", opacity: 0.6 }}>
                                    {formatValue(oldValue)}
                                </span>
                            )}
                        </div>
                    )}

                    {editing ? (
                        arrayField ? (
                            <textarea
                                className={styles.inlineEdit}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") cancelEdit();
                                }}
                                rows={Math.max(3, (editValue.match(/\n/g) || []).length + 2)}
                                autoFocus
                                placeholder="One item per line"
                            />
                        ) : (
                            <input
                                className={styles.inlineEdit}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitEdit();
                                    if (e.key === "Escape") cancelEdit();
                                }}
                                autoFocus
                            />
                        )
                    ) : (
                        <div className={styles.picoFieldValue}>
                            {arrayField && Array.isArray(displayValue) ? (
                                (displayValue as string[]).length === 0 ? (
                                    <span style={{ color: "var(--text-muted)", fontStyle: "italic", flex: 1 }}>(cleared)</span>
                                ) : (
                                    <ul style={{ margin: 0, paddingLeft: 16, flex: 1 }}>
                                        {(displayValue as string[]).map((item, i) => (
                                            <li key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>{item}</li>
                                        ))}
                                    </ul>
                                )
                            ) : (
                                <span>{formatValue(displayValue)}</span>
                            )}
                            {isReviewable ? (
                                <button
                                    type="button"
                                    className={styles.picoEditBtn}
                                    onClick={() => setEditing(true)}
                                    aria-label={`Edit ${label}`}
                                >
                                    <span className="material-icons-round">edit</span>
                                </button>
                            ) : null}
                        </div>
                    )}
                </div>

                {/* Rationale */}
                {rationale && (
                    <div className={styles.criteriaRationale}>{rationale}</div>
                )}
            </div>

            {isReviewable ? (
                <div className={styles.cardActions}>
                    {onDiscuss ? (
                        <button type="button" className={styles.actionBtnGhost} onClick={onDiscuss} disabled={!canAct}>
                            Discuss more
                        </button>
                    ) : null}
                    <button type="button" className={styles.actionBtn} onClick={handleAccept} disabled={!canAct}>
                        {hasEdited ? "Accept Edited & Save" : "Accept & Save to Protocol"}
                    </button>
                </div>
            ) : settledLabel ? (
                <div className={styles.applyMeta}>{settledLabel}</div>
            ) : null}
        </>
    );
}
