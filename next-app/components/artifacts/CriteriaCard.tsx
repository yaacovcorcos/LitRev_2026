"use client";

import { useState } from "react";
import type { CriteriaCardPayload } from "@/types/artifacts";
import styles from "@/styles/artifacts.module.css";

export type CriteriaCardProps = {
    payload: CriteriaCardPayload;
    onSave: () => void;
    onAdd?: (type: "inclusion" | "exclusion", criterion: string) => void;
    onRemove?: (type: "inclusion" | "exclusion", index: number) => void;
    onDiscuss?: () => void;
    canAct?: boolean;
};

export function CriteriaCard({ payload, onSave, onAdd, onRemove, onDiscuss, canAct = true }: CriteriaCardProps) {
    const [addingType, setAddingType] = useState<"inclusion" | "exclusion" | null>(null);
    const [addValue, setAddValue] = useState("");

    const commitAdd = () => {
        if (addingType && addValue.trim() && onAdd) {
            onAdd(addingType, addValue.trim());
        }
        setAddingType(null);
        setAddValue("");
    };

    const canEdit = !!onAdd && !!onRemove;

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
                        {onRemove ? (
                            <button
                                type="button"
                                className={styles.criteriaRemoveBtn}
                                onClick={() => onRemove(type, i)}
                                aria-label={`Remove: ${item}`}
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        ) : null}
                    </li>
                ))}
            </ul>
            {canEdit && addingType === type ? (
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
            ) : canEdit ? (
                <button
                    type="button"
                    className={styles.criteriaAddBtn}
                    onClick={() => setAddingType(type)}
                >
                    <span className="material-icons-round">add</span>
                    Add criterion
                </button>
            ) : null}
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
                {onDiscuss ? (
                    <button type="button" className={styles.actionBtnGhost} onClick={onDiscuss} disabled={!canAct}>
                        Discuss more
                    </button>
                ) : null}
                <button type="button" className={styles.actionBtn} onClick={onSave} disabled={!canAct}>
                    Save to Protocol
                </button>
            </div>
        </>
    );
}
