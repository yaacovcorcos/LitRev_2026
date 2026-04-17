"use client";

import type { Study } from "@/types/ledger";
import styles from "./draft-studio.module.css";

type DraftContextRailProps = {
  activeSectionLabel: string;
  isReferencesSection: boolean;
  usedEvidence: Study[];
  onAddEvidence: () => void;
  onCollapse: () => void;
  onInsertCitation: (studyId: string) => void;
  onRemoveEvidence: (studyId: string) => void;
  studyLabel: (study: Study) => string;
};

export function DraftContextRail({
  activeSectionLabel,
  isReferencesSection,
  usedEvidence,
  onAddEvidence,
  onCollapse,
  onInsertCitation,
  onRemoveEvidence,
  studyLabel,
}: DraftContextRailProps) {
  return (
    <div className={styles.evidencePane} data-testid="evidence-pane">
      <div className={styles.ledgerHeader}>
        <div className={styles.ledgerHeaderTop}>
          <span className={styles.ledgerTitle}>Evidence Ledger</span>
          <div className={styles.panelHeaderActions}>
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
            <button
              type="button"
              className={styles.panelToggle}
              aria-label="Collapse evidence ledger"
              onClick={onCollapse}
            >
              <span className="material-icons-round">menu_open</span>
            </button>
          </div>
        </div>
        <div className={styles.ledgerContext}>
          <span className={styles.ledgerContextLabel}>for</span>
          <span className={styles.ledgerContextSection}>{activeSectionLabel}</span>
        </div>
      </div>

      <div className={styles.panelBody}>
        {isReferencesSection ? (
          <div className={styles.emptyPanel}>
            <div className={styles.emptyIcon}>
              <span className="material-icons-round">auto_awesome</span>
            </div>
            <h3>Auto-generated section</h3>
            <p>References are generated from citation nodes in manuscript sections.</p>
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
    </div>
  );
}
