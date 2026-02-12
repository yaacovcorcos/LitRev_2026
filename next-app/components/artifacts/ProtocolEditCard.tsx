"use client";

import { useState } from "react";
import styles from "@/styles/artifacts.module.css";
import type { ProtocolSuggestionPayload } from "@/types/artifacts";

/** Human-readable labels for dot-notation protocol field paths */
const FIELD_LABELS: Record<string, string> = {
    "pico.population": "P — Population",
    "pico.intervention": "I — Intervention",
    "pico.comparison": "C — Comparison",
    "pico.outcome": "O — Outcome",
    "eligibility.inclusion": "Inclusion Criteria",
    "eligibility.exclusion": "Exclusion Criteria",
    "searchStrategy.query": "Search Query",
    "searchStrategy.databases": "Databases",
    "methodology.studyDesigns": "Study Designs",
    "methodology.timeFrameStart": "Time Frame Start",
    "methodology.timeFrameEnd": "Time Frame End",
    "methodology.qualityAssessmentTool": "Quality Assessment Tool",
    "methodology.qualityAssessmentNotes": "Quality Assessment Notes",
};

function isArrayField(field: string): boolean {
    return [
        "eligibility.inclusion",
        "eligibility.exclusion",
        "searchStrategy.databases",
        "methodology.studyDesigns",
    ].includes(field);
}

function formatValue(value: unknown): string {
    if (value == null || value === "") return "—";
    if (Array.isArray(value)) {
        return value.length === 0 ? "—" : value.join(", ");
    }
    return String(value);
}

export type ProtocolEditCardProps = {
    payload: ProtocolSuggestionPayload;
    onAccept: () => void;
    onEdit: (newValue: unknown) => void;
};

export function ProtocolEditCard({ payload, onAccept, onEdit }: ProtocolEditCardProps) {
    const { field, value, oldValue, rationale } = payload;
    const label = FIELD_LABELS[field] ?? field;
    const arrayField = isArrayField(field);

    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(() =>
        arrayField && Array.isArray(value) ? value.join("\n") : String(value ?? "")
    );

    const commitEdit = () => {
        const trimmed = editValue.trim();
        if (!trimmed) return;
        const newVal = arrayField
            ? trimmed.split("\n").map((s) => s.trim()).filter(Boolean)
            : trimmed;
        onEdit(newVal);
        setEditing(false);
    };

    return (
        <>
            <div className={styles.picoGrid}>
                <div className={styles.picoField}>
                    <span className={styles.picoFieldLabel}>{label}</span>

                    {/* Old value → New value diff */}
                    {oldValue != null && formatValue(oldValue) !== "—" && (
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
                                    if (e.key === "Escape") {
                                        setEditing(false);
                                        setEditValue(
                                            Array.isArray(value) ? value.join("\n") : String(value ?? "")
                                        );
                                    }
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
                                    if (e.key === "Escape") {
                                        setEditing(false);
                                        setEditValue(String(value ?? ""));
                                    }
                                }}
                                autoFocus
                            />
                        )
                    ) : (
                        <div className={styles.picoFieldValue}>
                            {arrayField && Array.isArray(value) ? (
                                <ul style={{ margin: 0, paddingLeft: 16, flex: 1 }}>
                                    {(value as string[]).map((item, i) => (
                                        <li key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <span>{formatValue(value)}</span>
                            )}
                            <button
                                type="button"
                                className={styles.picoEditBtn}
                                onClick={() => setEditing(true)}
                                aria-label={`Edit ${label}`}
                            >
                                <span className="material-icons-round">edit</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Rationale */}
                {rationale && (
                    <div className={styles.criteriaRationale}>{rationale}</div>
                )}
            </div>

            <div className={styles.cardActions}>
                <button type="button" className={styles.actionBtnGhost}>
                    Discuss more
                </button>
                <button type="button" className={styles.actionBtn} onClick={onAccept}>
                    Accept &amp; Save to Protocol
                </button>
            </div>
        </>
    );
}
