"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { UserInputQuestionType, UserInputOption } from "@/types/ai";
import styles from "./UserInputCard.module.css";

export interface UserInputCardProps {
    question: string;
    questionType: UserInputQuestionType;
    options?: UserInputOption[];
    header?: string;
    context?: string;
    answered: boolean;
    answer?: string;
    onAnswer: (answer: string) => void;
    onDismiss?: () => void;
}

const OTHER_SENTINEL = "__other__";

export function UserInputCard({
    question,
    questionType,
    options,
    header,
    context,
    answered,
    answer,
    onAnswer,
    onDismiss,
}: UserInputCardProps) {
    // For single_choice / yes_no: which radio is selected (label or OTHER_SENTINEL)
    const [selectedRadio, setSelectedRadio] = useState<string | null>(null);
    // For multi_select: set of selected labels
    const [selectedMulti, setSelectedMulti] = useState<Set<string>>(new Set());
    // Free-text for "Other" or free_text mode
    const [otherText, setOtherText] = useState("");
    const [freeText, setFreeText] = useState("");

    const isOtherSelected = selectedRadio === OTHER_SENTINEL;
    // Degrade to free_text if a choice type arrives without options (server should prevent this, but safety net)
    const effectiveType = (questionType === "single_choice" || questionType === "multi_select") && (!options || options.length === 0)
        ? "free_text" as const
        : questionType;
    const hasChoiceOptions = effectiveType === "single_choice" || effectiveType === "yes_no" || effectiveType === "multi_select";

    // ── Submit handlers ──────────────────────────────────────────

    const handleSubmit = useCallback(() => {
        if (effectiveType === "free_text") {
            if (freeText.trim()) onAnswer(freeText.trim());
            return;
        }
        if (effectiveType === "multi_select") {
            const labels = Array.from(selectedMulti);
            if (labels.length > 0) onAnswer(labels.join(", "));
            return;
        }
        // single_choice / yes_no
        if (selectedRadio === OTHER_SENTINEL) {
            if (otherText.trim()) onAnswer(otherText.trim());
        } else if (selectedRadio) {
            onAnswer(selectedRadio);
        }
    }, [effectiveType, freeText, selectedMulti, selectedRadio, otherText, onAnswer]);

    const canSubmit = (() => {
        if (effectiveType === "free_text") return freeText.trim().length > 0;
        if (effectiveType === "multi_select") return selectedMulti.size > 0;
        if (selectedRadio === OTHER_SENTINEL) return otherText.trim().length > 0;
        return selectedRadio !== null;
    })();

    const toggleMulti = useCallback((label: string) => {
        setSelectedMulti(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    }, []);

    // ── Keyboard shortcuts ───────────────────────────────────────
    // Escape → dismiss, 1-9 → select option, 0 → select "Other"

    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (answered) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't intercept when typing in a text field
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "TEXTAREA" || tag === "INPUT") return;

            if (e.key === "Escape" && onDismiss) {
                e.preventDefault();
                onDismiss();
                return;
            }

            if (!hasChoiceOptions || !options || options.length === 0) return;

            const num = parseInt(e.key, 10);
            if (isNaN(num)) return;

            e.preventDefault();
            const isRadio = effectiveType !== "multi_select";
            const hasOther = effectiveType !== "multi_select";

            if (num === 0 && hasOther) {
                // 0 → select "Other"
                if (isRadio) setSelectedRadio(OTHER_SENTINEL);
                return;
            }

            if (num >= 1 && num <= options.length) {
                const opt = options[num - 1];
                if (isRadio) setSelectedRadio(opt.label);
                else toggleMulti(opt.label);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [answered, hasChoiceOptions, options, effectiveType, onDismiss, toggleMulti]);

    // ── Answered (compact) ───────────────────────────────────────

    if (answered) {
        return (
            <div className={`${styles.card} ${styles.cardAnswered}`}>
                {header && (
                    <div className={styles.headerRow}>
                        <span className={styles.headerTag}>{header}</span>
                        {onDismiss && (
                            <button
                                type="button"
                                onClick={onDismiss}
                                style={{
                                    marginLeft: "auto",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "var(--color-text-secondary)",
                                    padding: 2,
                                    display: "flex",
                                }}
                                aria-label="Dismiss answered prompt"
                            >
                                <span className="material-icons-round" style={{ fontSize: 18 }}>close</span>
                            </button>
                        )}
                    </div>
                )}
                <div className={styles.question}>{question}</div>
                <div className={styles.answeredRow}>
                    <span className={`material-icons-round ${styles.answeredIcon}`}>check_circle</span>
                    <span className={styles.answeredText}>{answer}</span>
                </div>
            </div>
        );
    }

    // ── Active question ──────────────────────────────────────────

    return (
        <div className={styles.card} ref={cardRef}>
            {/* Header tag */}
            {header && (
                <div className={styles.headerRow}>
                    <span className={styles.headerTag}>{header}</span>
                    {onDismiss && (
                        <button
                            type="button"
                            onClick={onDismiss}
                            style={{
                                marginLeft: "auto",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--color-text-secondary)",
                                padding: 2,
                                display: "flex",
                            }}
                            aria-label="Dismiss"
                        >
                            <span className="material-icons-round" style={{ fontSize: 18 }}>close</span>
                        </button>
                    )}
                </div>
            )}

            {/* Question text */}
            <div className={styles.question}>{question}</div>

            {/* Context */}
            {context && <div className={styles.context}>{context}</div>}

            {/* Option list — radio for single_choice/yes_no, checkbox for multi_select */}
            {hasChoiceOptions && options && options.length > 0 && (
                <div className={styles.optionList}>
                    {options.map((opt, idx) => {
                        const isRadio = effectiveType !== "multi_select";
                        const isSelected = isRadio
                            ? selectedRadio === opt.label
                            : selectedMulti.has(opt.label);
                        const shortcutKey = idx < 9 ? idx + 1 : null;

                        return (
                            <div
                                key={opt.label}
                                className={`${styles.optionRow} ${isSelected ? styles.optionRowSelected : ""}`}
                                onClick={() => {
                                    if (isRadio) setSelectedRadio(opt.label);
                                    else toggleMulti(opt.label);
                                }}
                                role={isRadio ? "radio" : "checkbox"}
                                aria-checked={isSelected}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        if (isRadio) setSelectedRadio(opt.label);
                                        else toggleMulti(opt.label);
                                    }
                                }}
                            >
                                {/* Number shortcut indicator */}
                                {shortcutKey && (
                                    <span className={styles.optionShortcut} aria-hidden="true">{shortcutKey}</span>
                                )}
                                {/* Radio / checkbox indicator */}
                                {isRadio ? (
                                    <div className={`${styles.optionRadio} ${isSelected ? styles.optionRadioSelected : ""}`} />
                                ) : (
                                    <div className={`${styles.optionCheckbox} ${isSelected ? styles.optionCheckboxSelected : ""}`} />
                                )}
                                <div className={styles.optionContent}>
                                    <div className={styles.optionLabel}>{opt.label}</div>
                                    {opt.description && (
                                        <div className={styles.optionDescription}>{opt.description}</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* "Other" escape hatch — always present on choice questions */}
                    {effectiveType !== "multi_select" && (
                        <div
                            className={`${styles.optionRow} ${isOtherSelected ? styles.optionRowSelected : ""}`}
                            onClick={() => setSelectedRadio(OTHER_SENTINEL)}
                            role="radio"
                            aria-checked={isOtherSelected}
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSelectedRadio(OTHER_SENTINEL);
                                }
                            }}
                        >
                            <span className={styles.optionShortcut} aria-hidden="true">0</span>
                            <div className={`${styles.optionRadio} ${isOtherSelected ? styles.optionRadioSelected : ""}`} />
                            <div className={styles.optionContent}>
                                <div className={styles.optionLabel}>Other</div>
                                {isOtherSelected && (
                                    <textarea
                                        className={styles.otherInput}
                                        value={otherText}
                                        onChange={(e) => setOtherText(e.target.value)}
                                        placeholder="Type your answer..."
                                        rows={2}
                                        autoFocus
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                if (otherText.trim()) handleSubmit();
                                            }
                                            e.stopPropagation();
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Free text mode — full textarea */}
            {effectiveType === "free_text" && (
                <div style={{ padding: "4px 14px 0" }}>
                    <textarea
                        className={styles.otherInput}
                        value={freeText}
                        onChange={(e) => setFreeText(e.target.value)}
                        placeholder="Type your answer..."
                        rows={3}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (freeText.trim()) handleSubmit();
                            }
                        }}
                    />
                </div>
            )}

            {/* Footer with submit + keyboard hints */}
            <div className={styles.footer}>
                {hasChoiceOptions && (
                    <span className={styles.footerHint}>
                        Press 1-{Math.min(options?.length ?? 0, 9)} to select{onDismiss ? " · Esc to dismiss" : ""}
                    </span>
                )}
                <button
                    type="button"
                    className={styles.submitBtn}
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                >
                    Submit{effectiveType === "multi_select" && selectedMulti.size > 0
                        ? ` (${selectedMulti.size})`
                        : ""}
                </button>
            </div>
        </div>
    );
}
