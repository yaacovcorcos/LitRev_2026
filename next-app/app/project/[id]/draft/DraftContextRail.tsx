"use client";

import type { Study } from "@/types/ledger";
import styles from "./draft-studio.module.css";

type DraftContextRailProps = {
  activeSectionLabel: string;
  isReferencesSection: boolean;
  usedEvidence: Study[];
  onAddEvidence: () => void;
  onInsertCitation: (studyId: string) => void;
  onRemoveEvidence: (studyId: string) => void;
  studyLabel: (study: Study) => string;
};

export function DraftContextRail({
  activeSectionLabel,
  isReferencesSection,
  usedEvidence,
  onAddEvidence,
  onInsertCitation,
  onRemoveEvidence,
  studyLabel,
}: DraftContextRailProps) {
  return (
    <aside className={styles.contextRail} aria-label="Draft context">
      <div className={styles.railHeader}>
        <div>
          <div className={styles.railEyebrow}>Context</div>
          <h2 className={styles.railTitle}>Evidence Ledger</h2>
        </div>
        {!isReferencesSection ? (
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Add evidence"
            onClick={onAddEvidence}
          >
            <span className="material-icons-round">add</span>
          </button>
        ) : null}
      </div>

      <div className={styles.railContextLine}>
        <span className={styles.railContextLabel}>For</span>
        <span className={styles.railContextValue}>{activeSectionLabel}</span>
      </div>

      <div className={styles.panelBody}>
        {isReferencesSection ? (
          <div className={styles.emptyPanel}>
            <div className={styles.emptyIcon}>
              <span className="material-icons-round">auto_awesome</span>
            </div>
            <h3>Auto-generated section</h3>
            <p>References are generated from citation nodes in the manuscript.</p>
          </div>
        ) : usedEvidence.length === 0 ? (
          <div className={styles.emptyPanel}>
            <div className={styles.emptyIcon}>
              <span className="material-icons-round">library_add</span>
            </div>
            <h3>No evidence yet</h3>
            <p>Add papers you’ll cite for this section.</p>
            <button type="button" className="header-btn header-btn-primary" onClick={onAddEvidence}>
              Add evidence
            </button>
          </div>
        ) : (
          <div className={styles.ledgerList}>
            {usedEvidence.map((study) => (
              <div key={study.id} className={styles.ledgerItem}>
                <div className={styles.ledgerMeta}>
                  <div className={styles.ledgerLabel}>{studyLabel(study)}</div>
                  <div className={styles.ledgerTitle}>{study.title}</div>
                </div>
                <div className={styles.ledgerActions}>
                  <button type="button" className={styles.smallBtn} onClick={() => onInsertCitation(study.id)}>
                    Cite
                  </button>
                  <button type="button" className={styles.smallBtnGhost} onClick={() => onRemoveEvidence(study.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
