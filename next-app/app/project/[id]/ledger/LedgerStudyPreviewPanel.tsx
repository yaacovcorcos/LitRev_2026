"use client";

import { useEffect, useEffectEvent } from "react";
import Link from "next/link";
import type { Study } from "@/types/ledger";
import { LedgerStudySnapshot } from "./LedgerStudySnapshot";
import styles from "./ledger-study-preview-panel.module.css";

type LedgerStudyPreviewPanelProps = {
  study: Study;
  detailHref: string;
  onClose: () => void;
  onOpenFiles: (study: Study) => void;
};

export function LedgerStudyPreviewPanel({
  study,
  detailHref,
  onClose,
  onOpenFiles,
}: LedgerStudyPreviewPanelProps) {
  const onWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, []);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`${study.title} preview`}
      >
        <div className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.eyebrow}>Study Preview</p>
            <h2>{study.title}</h2>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={`Close preview for ${study.title}`}
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => onOpenFiles(study)}
          >
            <span className="material-icons-round">attach_file</span>
            Manage files
          </button>
          <Link href={detailHref} className={styles.primaryAction}>
            <span className="material-icons-round">open_in_new</span>
            Open full study
          </Link>
        </div>

        <div className={styles.body}>
          <LedgerStudySnapshot study={study} mode="preview" />
        </div>
      </aside>
    </>
  );
}
