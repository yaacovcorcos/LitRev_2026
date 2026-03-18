"use client";

import type { ArtifactStatus, ScreeningBatchPayload } from "@/types/artifacts";
import { getArtifactSettledLabel, isArtifactReviewable } from "@/lib/artifacts/reviewability";
import styles from "@/styles/artifacts.module.css";

export type ScreeningBatchProps = {
    payload: ScreeningBatchPayload;
    status?: ArtifactStatus;
    onAcceptAll: () => void;
    onReviewEach?: () => void;
    onOverride?: (index: number, recommendation: "keep" | "exclude" | "maybe") => void;
    canAct?: boolean;
};

export function ScreeningBatch({ payload, status = "proposed", onAcceptAll, onReviewEach, onOverride, canAct = true }: ScreeningBatchProps) {
    const { summary, studies } = payload;
    const isReviewable = isArtifactReviewable(status);
    const canOverride = isReviewable && typeof onOverride === "function";
    const settledLabel = getArtifactSettledLabel(status);

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
                            {canOverride ? <th>Override</th> : null}
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
                                {canOverride ? (
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
                                ) : null}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isReviewable ? (
                <div className={styles.cardActions}>
                    {onReviewEach ? (
                        <button type="button" className={styles.actionBtnGhost} onClick={onReviewEach} disabled={!canAct}>
                            Review each
                        </button>
                    ) : null}
                    <button type="button" className={styles.actionBtn} onClick={onAcceptAll} disabled={!canAct}>
                        Accept all recommendations
                    </button>
                </div>
            ) : settledLabel ? (
                <div className={styles.applyMeta}>{settledLabel}</div>
            ) : null}
        </>
    );
}
