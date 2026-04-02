"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Study } from "@/types/ledger";
import { studyLabel } from "./draft-helpers";
import styles from "./draft-studio.module.css";

type AddEvidenceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  studies: Study[];
  usedEvidenceIds: string[];
  onAddEvidence: (refId: string) => void;
  projectId: string;
};

type AddEvidenceModalContentProps = Omit<AddEvidenceModalProps, "isOpen">;

function AddEvidenceModalContent({
  onClose,
  studies,
  usedEvidenceIds,
  onAddEvidence,
  projectId,
}: AddEvidenceModalContentProps) {
  const [evidenceQuery, setEvidenceQuery] = useState("");
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  const filteredEvidence = useMemo(() => {
    const q = evidenceQuery.trim().toLowerCase();
    if (!q) return studies;
    return studies.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.authors.toLowerCase().includes(q) ||
        studyLabel(s).toLowerCase().includes(q) ||
        s.details?.journal?.toLowerCase().includes(q)
    );
  }, [studies, evidenceQuery]);

  useEffect(() => {
    if (!overlayRef.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      lastFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      data-state="open"
      aria-hidden={false}
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-glass" data-state="open" role="dialog" aria-modal="true" aria-labelledby="addEvidenceTitle">
        <div className="modal-header">
          <h2 id="addEvidenceTitle">Add Evidence</h2>
          <button className="close-modal-btn" aria-label="Close" onClick={onClose}>
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalSearch}>
            <span className={`material-icons-round ${styles.modalSearchIcon}`}>search</span>
            <input
              type="text"
              value={evidenceQuery}
              onChange={(e) => setEvidenceQuery(e.target.value)}
              placeholder="Search references…"
              aria-label="Search references"
            />
          </div>

          <div className={styles.modalList}>
            {filteredEvidence.length === 0 ? (
              <div className={styles.emptyModal}>
                <p>{studies.length === 0 ? "No studies in your Evidence Ledger yet." : "No matching studies found."}</p>
                {studies.length === 0 && (
                  <Link href={`/project/${projectId}/ledger`} className="header-btn header-btn-primary">
                    Go to Evidence Ledger
                  </Link>
                )}
              </div>
            ) : (
              filteredEvidence.map((study) => {
                const isAdded = usedEvidenceIds.includes(study.id);
                return (
                  <div key={study.id} className={styles.modalItem}>
                    <div className={styles.modalItemMeta}>
                      <div className={styles.ledgerLabel}>{studyLabel(study)}</div>
                      <div className={styles.ledgerTitle}>{study.title}</div>
                    </div>
                    <button
                      type="button"
                      className={isAdded ? styles.smallBtnDisabled : styles.smallBtn}
                      disabled={isAdded}
                      onClick={() => onAddEvidence(study.id)}
                    >
                      {isAdded ? "Added" : "Add"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AddEvidenceModal({ isOpen, ...props }: AddEvidenceModalProps) {
  if (!isOpen) {
    return null;
  }

  return <AddEvidenceModalContent {...props} />;
}
