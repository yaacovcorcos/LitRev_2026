"use client";

import { memo } from "react";
import Link from "next/link";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { useContextCaptureActions } from "@/hooks/useContextCaptureActions";
import { buildStudyTarget } from "@/lib/context-capture/targets";
import { type CriteriaMatchResult } from "@/lib/criteria-matching";
import { getStudyProcessingStatusView } from "@/lib/study-processing-ui";
import type { Study, StudyDetails, TriageDecision } from "@/types/ledger";
import styles from "./ledger.module.css";

export type StudyRowProps = {
  study: Study;
  projectId: string;
  previewHref: string;
  detailHref: string;
  isExpanded: boolean;
  isSelected: boolean;
  isSelectMode: boolean;
  isPreviewActive: boolean;
  hasProtocolCriteria: boolean;
  criteriaMatch: CriteriaMatchResult | undefined;
  onToggleExpand: (studyId: string) => void;
  onToggleSelect: (studyId: string) => void;
  onOpenFiles: (study: Study) => void;
  onDeleteStudy: (studyId: string) => void;
  onTriage: (studyId: string, decision: TriageDecision) => void;
};

export const StudyRow = memo(function StudyRow({
  study,
  projectId,
  previewHref,
  detailHref,
  isExpanded,
  isSelected,
  isSelectMode,
  isPreviewActive,
  hasProtocolCriteria,
  criteriaMatch,
  onToggleExpand,
  onToggleSelect,
  onOpenFiles,
  onDeleteStudy,
  onTriage,
}: StudyRowProps) {
  const { openPopupChat } = usePopupChat();
  const { captureEnabled, openPopupForTarget } = useContextCaptureActions();
  const details: StudyDetails = study.details ?? {};
  const processingStatus = getStudyProcessingStatusView(study);

  const summaryText =
    details.aiSummary || details.abstract || "No summary available.";
  const oneSentence = `${summaryText.split(/[.!?](?:\s|$)/)[0]}.`;
  const displaySummary =
    oneSentence.length > 200 ? `${oneSentence.slice(0, 200)}...` : oneSentence;

  const authorParts = study.authors.split(/,\s*/);
  const shortAuthors =
    authorParts.length >= 3 ? `${authorParts[0]} et al.` : study.authors;
  const metaParts = [shortAuthors, String(study.year)];
  if (details.journal) metaParts.push(details.journal);
  if (details.studyType) metaParts.push(details.studyType);
  const citationLine = metaParts.join(" · ");

  const rowClass = [
    isSelected ? styles.rowSelected : "",
    isExpanded ? styles.rowExpanded : "",
    isPreviewActive ? styles.rowPreviewActive : "",
  ]
    .filter(Boolean)
    .join(" ");

  const colSpan = isSelectMode
    ? hasProtocolCriteria
      ? 8
      : 7
    : hasProtocolCriteria
      ? 7
      : 6;

  return (
    <>
      <tr className={rowClass}>
        <td className={styles.expandCell}>
          <button
            className={`${styles.expandBtn} ${isExpanded ? styles.expanded : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand(study.id);
            }}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            aria-expanded={isExpanded}
          >
            <span className="material-icons-round">expand_more</span>
          </button>
        </td>
        {isSelectMode ? (
          <td className={styles.selectCell}>
            <input
              className={styles.selectCheckbox}
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(study.id)}
              aria-label={`Select ${study.title}`}
            />
          </td>
        ) : null}
        <td className={styles.titleCell}>
          <Link href={previewHref} className={styles.studyTitleLink} scroll={false}>
            <span className={styles.studyTitle}>{study.title}</span>
          </Link>
          <div className={styles.studyCitation} title={study.authors}>
            {citationLine}
          </div>
        </td>
        <td>
          <span
            className={`${styles.statusPill} ${
              processingStatus.tone === "success"
                ? styles.statusSuccess
                : processingStatus.tone === "info"
                  ? styles.statusInfo
                  : processingStatus.tone === "danger"
                    ? styles.statusDanger
                    : styles.statusNeutral
            }`}
            title={processingStatus.description}
          >
            {processingStatus.label}
          </span>
        </td>
        <td>
          <span
            className={`${styles.qualityBadge} ${
              study.quality === "High"
                ? styles.qualityHigh
                : study.quality === "Medium"
                  ? styles.qualityMedium
                  : ""
            }`}
          >
            {study.quality}
          </span>
        </td>
        <td>
          {details.triageDecision ? (
            <span
              className={`${styles.triageBadge} ${
                details.triageDecision === "keep"
                  ? styles.triageBadgeKeep
                  : details.triageDecision === "exclude"
                    ? styles.triageBadgeExclude
                    : styles.triageBadgeMaybe
              }`}
            >
              {details.triageDecision === "keep"
                ? "Keep"
                : details.triageDecision === "exclude"
                  ? "Exclude"
                  : "Maybe"}
            </span>
          ) : (
            <span className={styles.triageBadge} style={{ opacity: 0.5 }}>
              —
            </span>
          )}
        </td>
        {hasProtocolCriteria ? (
          <td>
            {criteriaMatch?.meetsAllCriteria ? (
              <span
                className={`${styles.criteriaBadge} ${styles.criteriaBadgeMeets}`}
                title="Meets all protocol criteria"
              >
                <span className="material-icons-round">check_circle</span>
              </span>
            ) : criteriaMatch?.exclusionReasons?.length ? (
              <span
                className={`${styles.criteriaBadge} ${styles.criteriaBadgeFails}`}
                title={criteriaMatch.exclusionReasons.join("; ")}
              >
                <span className="material-icons-round">error</span>
              </span>
            ) : (
              <span className={styles.criteriaBadge} style={{ opacity: 0.5 }}>
                —
              </span>
            )}
          </td>
        ) : null}
        <td>
          <Link
            href={detailHref}
            className={styles.actionBtnLink}
            aria-label={`Open full study page for ${study.title}`}
            title="Open full study"
          >
            <span className="material-icons-round">open_in_new</span>
          </Link>
          <button
            className={styles.actionBtn}
            aria-label={`Manage files for ${study.title}`}
            title="Manage Files"
            onClick={() => onOpenFiles(study)}
          >
            <span className="material-icons-round">attach_file</span>
          </button>
          <button
            className={styles.actionBtn}
            title="Delete Study"
            aria-label={`Delete ${study.title}`}
            onClick={() => onDeleteStudy(study.id)}
          >
            <span className="material-icons-round">delete</span>
          </button>
        </td>
      </tr>
      {isExpanded ? (
        <tr className={styles.expandedRow}>
          <td colSpan={colSpan}>
            <div className={styles.expandedContent}>
              <div className={styles.expandedSection}>
                <p className={styles.abstractText}>{displaySummary}</p>
              </div>

              <div className={styles.triageActions}>
                <button
                  className={`${styles.triageBtn} ${styles.triageBtnKeep} ${
                    details.triageDecision === "keep" ? styles.active : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTriage(study.id, "keep");
                  }}
                >
                  Keep
                </button>
                <button
                  className={`${styles.triageBtn} ${styles.triageBtnExclude} ${
                    details.triageDecision === "exclude" ? styles.active : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTriage(study.id, "exclude");
                  }}
                >
                  Exclude
                </button>
                <button
                  className={`${styles.triageBtn} ${styles.triageBtnMaybe} ${
                    details.triageDecision === "maybe" ? styles.active : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTriage(study.id, "maybe");
                  }}
                >
                  Maybe
                </button>
                <button
                  className={styles.triageBtn}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (captureEnabled) {
                      openPopupForTarget(buildStudyTarget({
                        projectId,
                        study: {
                          studyId: study.id,
                          title: study.title,
                          authors: study.authors,
                          year: study.year,
                          abstract: displaySummary,
                          journal: details.journal,
                          quality: study.quality,
                          aiSummary: details.aiSummary,
                        },
                      }));
                      return;
                    }
                    openPopupChat({
                      type: "study",
                      projectId,
                      studyId: study.id,
                      title: study.title,
                      abstract: displaySummary,
                      authors: study.authors,
                    });
                  }}
                >
                  <span className="material-icons-round">smart_toy</span>
                  Ask AI
                </button>
              </div>

              <div className={styles.expandedMeta}>
                {details.journal ? (
                  <span className={styles.metaChip}>
                    <span className="material-icons-round">menu_book</span>
                    {details.journal}
                  </span>
                ) : null}
                {details.studyType ? (
                  <span className={styles.metaChip}>
                    <span className="material-icons-round">category</span>
                    {details.studyType}
                  </span>
                ) : null}
                {details.doi ? (
                  <a
                    href={`https://doi.org/${details.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.metaChip}
                  >
                    <span className="material-icons-round">link</span>
                    DOI
                  </a>
                ) : null}
                <Link
                  href={detailHref}
                  className={styles.viewDetailsLink}
                >
                  Open full study
                </Link>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
});
