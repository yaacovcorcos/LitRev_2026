"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactStatus, DraftDiffPayload } from "@/types/artifacts";
import { isArtifactReviewable } from "@/lib/artifacts/reviewability";
import styles from "@/styles/artifacts.module.css";
import markdownStyles from "@/styles/markdown.module.css";

export type DraftBlockProps = {
    payload: DraftDiffPayload;
    status?: ArtifactStatus;
    onAccept: () => void;
    onEdit?: () => void;
    onRedo?: () => void;
    canAct?: boolean;
};

export function DraftBlock({ payload, status = "proposed", onAccept, onEdit, onRedo, canAct = true }: DraftBlockProps) {
    const sectionLabel = payload.subsection
        ? `${payload.section} § ${payload.subsection}`
        : payload.section;
    const isReviewable = isArtifactReviewable(status);

    return (
        <>
            <div className={styles.draftSectionLabel}>{sectionLabel}</div>
            <div className={`${styles.draftContent} ${markdownStyles.markdownContent}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {payload.content}
                </ReactMarkdown>
            </div>
            {payload.citations.length > 0 && (
                <div className={styles.draftSectionLabel} style={{ marginTop: 8 }}>
                    {payload.citations.length} citation{payload.citations.length !== 1 ? "s" : ""}
                </div>
            )}
            <div className={styles.draftWordCount}>
                {payload.wordCount} word{payload.wordCount !== 1 ? "s" : ""}
            </div>
            {isReviewable ? (
                <div className={styles.cardActions}>
                    {onRedo ? (
                        <button type="button" className={styles.actionBtnGhost} onClick={onRedo} disabled={!canAct}>
                            Redo
                        </button>
                    ) : null}
                    {onEdit ? (
                        <button type="button" className={styles.actionBtnGhost} onClick={onEdit} disabled={!canAct}>
                            Edit first
                        </button>
                    ) : null}
                    <button type="button" className={styles.actionBtn} onClick={onAccept} disabled={!canAct}>
                        Accept &amp; save to draft
                    </button>
                </div>
            ) : null}
        </>
    );
}
