"use client";

import type { ScreeningBatchPayload } from "@/types/artifacts";
import styles from "@/styles/artifacts.module.css";

export type ScreeningBatchProps = {
    payload: ScreeningBatchPayload;
    onAcceptAll: () => void;
    onReviewEach: () => void;
    onOverride: (index: number, recommendation: "keep" | "exclude" | "maybe") => void;
};

export function ScreeningBatch({ payload, onAcceptAll, onReviewEach, onOverride }: ScreeningBatchProps) {
    const { summary, studies } = payload;

    return (
        <>
            <div className={styles.batchSummary}>
                {summary.total} studies found: {summary.keepCount} keep, {summary.excludeCount} exclude, {summary.maybeCount} maybe
            </div>

            <div className={styles.batchTableWrapper}>
                <table className={styles.batchTable}>
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Type</th>
                            <th>N</th>
                            <th>Rec.</th>
                            <th>Conf.</th>
                            <th>Override</th>
                        </tr>
                    </thead>
                    <tbody>
                        {studies.map((study, i) => (
                            <tr key={i}>
                                <td className={styles.batchTitleCell} title={study.title}>
                                    {study.title}
                                </td>
                                <td>{study.studyType || "—"}</td>
                                <td>{study.sampleSize ?? "—"}</td>
                                <td>
                                    <span className={`${styles.recommendBadge} ${
                                        study.recommendation === "keep" ? styles.recommendKeep :
                                        study.recommendation === "exclude" ? styles.recommendExclude :
                                        styles.recommendMaybe
                                    }`}>
                                        {study.recommendation}
                                    </span>
                                </td>
                                <td>{Math.round(study.confidence * 100)}%</td>
                                <td>
                                    <select
                                        className={styles.batchOverrideSelect}
                                        value={study.recommendation}
                                        onChange={(e) =>
                                            onOverride(i, e.target.value as "keep" | "exclude" | "maybe")
                                        }
                                    >
                                        <option value="keep">Keep</option>
                                        <option value="exclude">Exclude</option>
                                        <option value="maybe">Maybe</option>
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={styles.cardActions}>
                <button type="button" className={styles.actionBtnGhost} onClick={onReviewEach}>
                    Review each
                </button>
                <button type="button" className={styles.actionBtn} onClick={onAcceptAll}>
                    Accept all recommendations
                </button>
            </div>
        </>
    );
}
