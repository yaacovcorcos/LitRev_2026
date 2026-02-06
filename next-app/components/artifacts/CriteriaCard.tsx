"use client";

import { useState } from "react";
import type { CriteriaCardPayload } from "@/types/artifacts";
import styles from "@/styles/artifacts.module.css";

export type CriteriaCardProps = {
    payload: CriteriaCardPayload;
    onSave: () => void;
    onAdd: (type: "inclusion" | "exclusion", criterion: string) => void;
    onRemove: (type: "inclusion" | "exclusion", index: number) => void;
};

export function CriteriaCard({ payload, onSave, onAdd, onRemove }: CriteriaCardProps) {
    const [addingType, setAddingType] = useState<"inclusion" | "exclusion" | null>(null);
    const [addValue, setAddValue] = useState("");

    const commitAdd = () => {
        if (addingType && addValue.trim()) {
            onAdd(addingType, addValue.trim());
        }
        setAddingType(null);
        setAddValue("");
    };

    const renderList = (type: "inclusion" | "exclusion", items: string[], icon: string) => (
        <div className={styles.criteriaSection}>
            <div className={styles.criteriaSectionLabel}>
                {type === "inclusion" ? "Inclusion Criteria" : "Exclusion Criteria"}
            </div>
            <ul className={styles.criteriaList}>
                {items.map((item, i) => (
                    <li key={i} className={styles.criteriaItem}>
                        <span className={`material-icons-round ${styles.criteriaItemIcon}`}>{icon}</span>
                        <span className={styles.criteriaItemText}>{item}</span>
                        <button
                            type="button"
                            className={styles.criteriaRemoveBtn}
                            onClick={() => onRemove(type, i)}
                            aria-label={`Remove: ${item}`}
                        >
                            <span className="material-icons-round">close</span>
                        </button>
                    </li>
                ))}
            </ul>
            {addingType === type ? (
                <input
                    className={styles.inlineEdit}
                    value={addValue}
                    onChange={(e) => setAddValue(e.target.value)}
                    onBlur={commitAdd}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commitAdd();
                        if (e.key === "Escape") {
                            setAddingType(null);
                            setAddValue("");
                        }
                    }}
                    placeholder={`Add ${type} criterion...`}
                    autoFocus
                />
            ) : (
                <button
                    type="button"
                    className={styles.criteriaAddBtn}
                    onClick={() => setAddingType(type)}
                >
                    <span className="material-icons-round">add</span>
                    Add criterion
                </button>
            )}
        </div>
    );

    return (
        <>
            {renderList("inclusion", payload.inclusion, "check")}
            {renderList("exclusion", payload.exclusion, "block")}
            {payload.rationale && (
                <div className={styles.criteriaRationale}>{payload.rationale}</div>
            )}
            <div className={styles.cardActions}>
                <button type="button" className={styles.actionBtnGhost}>
                    Discuss more
                </button>
                <button type="button" className={styles.actionBtn} onClick={onSave}>
                    Save to Protocol
                </button>
            </div>
        </>
    );
}
