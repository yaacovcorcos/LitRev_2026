"use client";

import { useState } from "react";
import styles from "@/styles/artifacts.module.css";

export type PICOValues = {
    population: string;
    intervention: string;
    comparison: string;
    outcome: string;
};

export type PICOCardProps = {
    payload: PICOValues;
    onAccept: () => void;
    onEdit: (field: keyof PICOValues, value: string) => void;
};

const PICO_LABELS: { key: keyof PICOValues; label: string }[] = [
    { key: "population", label: "P — Population" },
    { key: "intervention", label: "I — Intervention" },
    { key: "comparison", label: "C — Comparison" },
    { key: "outcome", label: "O — Outcome" },
];

export function PICOCard({ payload, onAccept, onEdit }: PICOCardProps) {
    const [editingField, setEditingField] = useState<keyof PICOValues | null>(null);
    const [editValue, setEditValue] = useState("");

    const startEdit = (field: keyof PICOValues) => {
        setEditingField(field);
        setEditValue(payload[field]);
    };

    const commitEdit = () => {
        if (editingField && editValue.trim()) {
            onEdit(editingField, editValue.trim());
        }
        setEditingField(null);
        setEditValue("");
    };

    return (
        <>
            <div className={styles.picoGrid}>
                {PICO_LABELS.map(({ key, label }) => (
                    <div key={key} className={styles.picoField}>
                        <span className={styles.picoFieldLabel}>{label}</span>
                        {editingField === key ? (
                            <input
                                className={styles.inlineEdit}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitEdit();
                                    if (e.key === "Escape") {
                                        setEditingField(null);
                                        setEditValue("");
                                    }
                                }}
                                autoFocus
                            />
                        ) : (
                            <div className={styles.picoFieldValue}>
                                <span>{payload[key] || "—"}</span>
                                <button
                                    type="button"
                                    className={styles.picoEditBtn}
                                    onClick={() => startEdit(key)}
                                    aria-label={`Edit ${label}`}
                                >
                                    <span className="material-icons-round">edit</span>
                                </button>
                            </div>
                        )}
                    </div>
                ))}
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
