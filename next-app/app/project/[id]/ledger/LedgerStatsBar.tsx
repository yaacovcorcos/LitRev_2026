"use client";

import { useMemo } from "react";
import type { Study } from "@/types/ledger";
import styles from "./ledger.module.css";

type LedgerStatsBarProps = {
  studies: Study[];
  selectedCount: number;
};

export function LedgerStatsBar({
  studies,
  selectedCount,
}: LedgerStatsBarProps) {
  const triageCounts = useMemo(() => {
    let keep = 0;
    let exclude = 0;
    let maybe = 0;
    let pending = 0;

    for (const study of studies) {
      const decision = study.details?.triageDecision;
      if (decision === "keep") keep += 1;
      else if (decision === "exclude") exclude += 1;
      else if (decision === "maybe") maybe += 1;
      else pending += 1;
    }

    return { keep, exclude, maybe, pending };
  }, [studies]);

  return (
    <div className={styles.statsRow}>
      <div className={styles.statChip}>
        <span className="material-icons-round">description</span>
        <span>{studies.length} total</span>
      </div>
      <div className={`${styles.statChip} ${styles.statChipKeep}`}>
        <span className="material-icons-round">check_circle</span>
        <span>{triageCounts.keep} kept</span>
      </div>
      <div className={`${styles.statChip} ${styles.statChipExclude}`}>
        <span className="material-icons-round">cancel</span>
        <span>{triageCounts.exclude} excluded</span>
      </div>
      <div className={`${styles.statChip} ${styles.statChipMaybe}`}>
        <span className="material-icons-round">help_outline</span>
        <span>{triageCounts.maybe} maybe</span>
      </div>
      <div className={styles.statChip}>
        <span className="material-icons-round">pending</span>
        <span>{triageCounts.pending} untriaged</span>
      </div>
      {selectedCount > 0 ? (
        <div className={styles.statChip}>
          <span className="material-icons-round">checklist</span>
          <span>{selectedCount} selected</span>
        </div>
      ) : null}
    </div>
  );
}
