"use client";

import { useRef, useState, useEffect } from "react";
import type { StudyProposalPayload } from "@/types/artifacts";
import type { ArtifactStatus } from "@/types/artifacts";
import { isArtifactReviewable } from "@/lib/artifacts/reviewability";
import styles from "@/styles/artifacts.module.css";

export type StudyCardProps = {
    payload: StudyProposalPayload;
    status?: ArtifactStatus;
    onKeep: () => void;
    onExclude: (reason: string) => void;
    onMaybe?: () => void;
    canAct?: boolean;
};

const EXCLUDE_REASONS = [
    "Wrong population",
    "Wrong intervention",
    "Wrong outcome",
    "Wrong study design",
    "Duplicate",
    "Other",
];

const CRITERIA_LABELS: Record<string, string> = {
    population: "P",
    intervention: "I",
    comparison: "C",
    outcome: "O",
    design: "Design",
    sampleSize: "N",
};

export function StudyCard({ payload, status = "proposed", onKeep, onExclude, onMaybe, canAct = true }: StudyCardProps) {
    const [showAbstract, setShowAbstract] = useState(false);
    const [showExcludeMenu, setShowExcludeMenu] = useState(false);
    const excludeMenuRef = useRef<HTMLDivElement | null>(null);
    const isReviewable = isArtifactReviewable(status);

    // Close exclude menu on click outside
    useEffect(() => {
        if (!showExcludeMenu) return;
        const handleClick = (e: MouseEvent) => {
            if (excludeMenuRef.current && !excludeMenuRef.current.contains(e.target as Node)) {
                setShowExcludeMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showExcludeMenu]);

    const confidenceClass =
        payload.confidence >= 0.7 ? styles.confidenceHigh :
        payload.confidence >= 0.4 ? styles.confidenceMedium :
        styles.confidenceLow;

    const recommendClass =
        payload.recommendation === "keep" ? styles.recommendKeep :
        payload.recommendation === "exclude" ? styles.recommendExclude :
        styles.recommendMaybe;

    return (
        <>
            <p className={styles.studyTitle}>{payload.title}</p>
            <p className={styles.studyAuthors}>
                {payload.authors}, {payload.year}
            </p>

            <div className={styles.studyMeta}>
                {payload.studyType && (
                    <span className={styles.studyMetaItem}>{payload.studyType}</span>
                )}
                {payload.sampleSize != null && (
                    <span className={styles.studyMetaItem}>N={payload.sampleSize}</span>
                )}
                {payload.journal && (
                    <span className={styles.studyMetaItem}>{payload.journal}</span>
                )}
                {payload.keyDetail && (
                    <span className={styles.studyMetaItem}>{payload.keyDetail}</span>
                )}
            </div>

            {/* Criteria match indicators */}
            {payload.criteriaMatch && Object.keys(payload.criteriaMatch).length > 0 && (
                <div className={styles.criteriaIndicators}>
                    {Object.entries(payload.criteriaMatch).map(([key, match]) => (
                        <span
                            key={key}
                            className={`${styles.criteriaChip} ${match ? styles.criteriaChipMatch : styles.criteriaChipMiss}`}
                        >
                            {match ? "✓" : "✗"} {CRITERIA_LABELS[key] || key}
                        </span>
                    ))}
                </div>
            )}

            {/* Recommendation + confidence */}
            <div className={styles.studyRecommendationRow}>
                <span className={`${styles.recommendBadge} ${recommendClass}`}>
                    {payload.recommendation}
                </span>
                <span className={`${styles.confidenceBadge} ${confidenceClass}`}>
                    {Math.round(payload.confidence * 100)}%
                </span>
            </div>

            {/* Abstract (expandable) */}
            {payload.abstract && showAbstract && (
                <div className={styles.abstractSection}>{payload.abstract}</div>
            )}

            {/* Actions */}
            {isReviewable ? (
                <div className={styles.cardActions}>
                    {payload.abstract && (
                        <button
                            type="button"
                            className={styles.actionBtnGhost}
                            onClick={() => setShowAbstract(!showAbstract)}
                        >
                            {showAbstract ? "Hide abstract" : "See abstract"}
                        </button>
                    )}

                    {onMaybe && (
                        <button type="button" className={styles.maybeBtn} onClick={onMaybe} disabled={!canAct}>
                            Maybe
                        </button>
                    )}

                    <div className={styles.excludeDropdown} ref={excludeMenuRef}>
                        <button
                            type="button"
                            className={styles.excludeBtn}
                            onClick={() => setShowExcludeMenu(!showExcludeMenu)}
                            disabled={!canAct}
                        >
                            Exclude ▾
                        </button>
                        {showExcludeMenu && (
                            <div className={styles.excludeMenu}>
                                {EXCLUDE_REASONS.map((reason) => (
                                    <button
                                        key={reason}
                                        type="button"
                                        className={styles.excludeMenuItem}
                                        onClick={() => {
                                            onExclude(reason);
                                            setShowExcludeMenu(false);
                                        }}
                                    >
                                        {reason}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button type="button" className={styles.keepBtn} onClick={onKeep} disabled={!canAct}>
                        Keep
                    </button>
                </div>
            ) : null}
        </>
    );
}
