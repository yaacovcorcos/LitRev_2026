"use client";

import { useMemo, useState } from "react";
import type { ScopingReportPayload } from "@/types/artifacts";
import { isScopingDecisionCardV2Enabled } from "@/lib/agent/feature-flags";
import styles from "@/styles/artifacts.module.css";

type ScopingReportCardProps = {
    payload: ScopingReportPayload;
    onActionPrompt?: (prompt: string) => void;
};

const SCOPING_CARD_V2_ENABLED = isScopingDecisionCardV2Enabled();

function scoreClass(score: "low" | "medium" | "high") {
    if (score === "high") return styles.confidenceHigh;
    if (score === "low") return styles.confidenceLow;
    return styles.confidenceMedium;
}

function buildUseQuestionPrompt(question: string, index: number) {
    return `Use question ${index + 1}: "${question}". Propose updating my protocol research question for approval.`;
}

export function ScopingReportCard({ payload, onActionPrompt }: ScopingReportCardProps) {
    if (!SCOPING_CARD_V2_ENABLED) {
        return (
            <>
                <div className={styles.draftSectionLabel}>Scoping Report</div>
                <div className={styles.scopingTopic}>{payload.topic}</div>
                <div className={styles.criteriaRationale}>{payload.nextStep}</div>
            </>
        );
    }

    const [showAnalysis, setShowAnalysis] = useState(false);
    const topQuestions = useMemo(() => payload.recommendedQuestions.slice(0, 3), [payload.recommendedQuestions]);
    const canAct = typeof onActionPrompt === "function";

    return (
        <>
            <div className={styles.draftSectionLabel}>Scoping Decision</div>
            <div className={styles.scopingTopic}>{payload.topic}</div>

            <div className={styles.scopingMetaRow}>
                <span className={styles.confidenceBadge}>Density: {payload.landscape.evidenceDensity}</span>
                {payload.landscape.timeframe && (
                    <span className={styles.scopingTimeRange}>
                        {payload.landscape.timeframe.earliest ?? "?"} - {payload.landscape.timeframe.latest ?? "?"}
                    </span>
                )}
            </div>

            {topQuestions.length > 0 ? (
                <>
                    <div className={styles.draftSectionLabel} style={{ marginTop: 10 }}>Recommended Questions</div>
                    <ol className={styles.scopingQuestionList}>
                        {topQuestions.map((rec, index) => (
                            <li key={`question-${index}`} className={styles.scopingQuestionItem}>
                                <div className={styles.scopingQuestionTitle}>{rec.question}</div>
                                <div className={styles.scopingQuestionRationale}>{rec.rationale}</div>
                                <div className={styles.scopingQuestionScores}>
                                    <span className={`${styles.confidenceBadge} ${scoreClass(rec.feasibility)}`}>
                                        Feasibility: {rec.feasibility}
                                    </span>
                                    <span className={`${styles.confidenceBadge} ${scoreClass(rec.novelty)}`}>
                                        Novelty: {rec.novelty}
                                    </span>
                                </div>
                                <div className={styles.scopingQuestionActions}>
                                    <button
                                        type="button"
                                        className={styles.actionBtn}
                                        onClick={() => onActionPrompt?.(buildUseQuestionPrompt(rec.question, index))}
                                        disabled={!canAct}
                                    >
                                        Use This Question
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ol>
                </>
            ) : (
                <>
                    <div className={styles.criteriaRationale} style={{ marginTop: 8 }}>
                        No recommended questions yet. Run a deeper scan to generate focused options.
                    </div>
                </>
            )}

            <div className={styles.scopingActionRow}>
                <button
                    type="button"
                    className={styles.actionBtnGhost}
                    onClick={() =>
                        onActionPrompt?.(
                            `Refine this topic: "${payload.topic}". Give 3 tighter scope options with tradeoffs.`
                        )
                    }
                    disabled={!canAct}
                >
                    Refine Scope
                </button>
                <button
                    type="button"
                    className={styles.actionBtnGhost}
                    onClick={() =>
                        onActionPrompt?.(
                            `Run a deeper scan on "${payload.topic}" with broader synonyms and gap-focused follow-up searches.`
                        )
                    }
                    disabled={!canAct}
                >
                    Run Deeper Scan
                </button>
                <button
                    type="button"
                    className={styles.actionBtnGhost}
                    onClick={() =>
                        onActionPrompt?.(
                            `Summarize the strongest unresolved uncertainty before moving to protocol.`
                        )
                    }
                    disabled={!canAct}
                >
                    Stay In Scoping
                </button>
            </div>

            <div className={styles.criteriaRationale} style={{ marginTop: 8 }}>
                Choosing a question will propose an `update_protocol` change for your approval.
            </div>

            <button
                type="button"
                className={styles.provenanceToggle}
                onClick={() => setShowAnalysis((prev) => !prev)}
            >
                <span className={`material-icons-round ${showAnalysis ? styles.provenanceToggleExpanded : ""}`}>
                    chevron_right
                </span>
                {showAnalysis ? "Hide full analysis" : "View full analysis"}
            </button>

            {showAnalysis && (
                <div className={styles.scopingAnalysisSection}>
                    {payload.searchesRun.length > 0 && (
                        <>
                            <div className={styles.criteriaSectionLabel}>Searches Run</div>
                            <ul className={styles.scopingSearchList}>
                                {payload.searchesRun.map((search, index) => (
                                    <li key={`${search.database}-${search.query}-${index}`} className={styles.scopingSearchItem}>
                                        <div className={styles.scopingSearchMeta}>
                                            <span className={styles.scopingSearchSource}>{search.database}</span>
                                            {typeof search.resultCount === "number" && (
                                                <span className={styles.scopingSearchCount}>{search.resultCount} results</span>
                                            )}
                                        </div>
                                        <div className={styles.scopingSearchQuery}>{search.query}</div>
                                        {search.angle && <div className={styles.scopingSearchAngle}>{search.angle}</div>}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    {payload.landscape.majorThemes.length > 0 && (
                        <div className={styles.criteriaSection}>
                            <div className={styles.criteriaSectionLabel}>Major Themes</div>
                            <ul className={styles.criteriaList}>
                                {payload.landscape.majorThemes.map((theme, index) => (
                                    <li key={`theme-${index}`} className={styles.criteriaItem}>
                                        <span className={`material-icons-round ${styles.criteriaItemIcon}`}>label</span>
                                        <span className={styles.criteriaItemText}>{theme}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {payload.landscape.methodologicalPatterns.length > 0 && (
                        <div className={styles.criteriaSection}>
                            <div className={styles.criteriaSectionLabel}>Methodological Patterns</div>
                            <ul className={styles.criteriaList}>
                                {payload.landscape.methodologicalPatterns.map((pattern, index) => (
                                    <li key={`method-${index}`} className={styles.criteriaItem}>
                                        <span className={`material-icons-round ${styles.criteriaItemIcon}`}>analytics</span>
                                        <span className={styles.criteriaItemText}>{pattern}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {payload.landscape.evidenceGaps.length > 0 && (
                        <div className={styles.criteriaSection}>
                            <div className={styles.criteriaSectionLabel}>Evidence Gaps</div>
                            <ul className={styles.criteriaList}>
                                {payload.landscape.evidenceGaps.map((gap, index) => (
                                    <li key={`gap-${index}`} className={styles.criteriaItem}>
                                        <span className={`material-icons-round ${styles.criteriaItemIcon}`}>priority_high</span>
                                        <span className={styles.criteriaItemText}>{gap}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className={styles.criteriaRationale}>{payload.nextStep}</div>
                </div>
            )}
        </>
    );
}
