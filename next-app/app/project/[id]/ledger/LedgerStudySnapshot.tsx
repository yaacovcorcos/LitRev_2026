"use client";

import { StudyQuickInfo } from "@/components/StudyQuickInfo";
import { getStudyProcessingStatusView } from "@/lib/study-processing-ui";
import type { Study, StudyDetails, StudyRelevance } from "@/types/ledger";
import styles from "./ledger-study-snapshot.module.css";

type LedgerStudySnapshotProps = {
  study: Study;
  mode?: "full" | "preview";
  showSummary?: boolean;
  showProcessingDescription?: boolean;
  className?: string;
};

function getTriageLabel(triageDecision: StudyDetails["triageDecision"]) {
  switch (triageDecision) {
    case "keep":
      return "Keep";
    case "exclude":
      return "Exclude";
    case "maybe":
      return "Maybe";
    default:
      return "Unreviewed";
  }
}

function getRelevanceLabel(relevance: StudyRelevance | undefined) {
  if (!relevance) return "Not scored";
  const band = relevance.band.charAt(0).toUpperCase() + relevance.band.slice(1);
  return typeof relevance.score === "number" ? `${band} (${relevance.score})` : band;
}

export function LedgerStudySnapshot({
  study,
  mode = "preview",
  showSummary = true,
  showProcessingDescription = true,
  className,
}: LedgerStudySnapshotProps) {
  const details: StudyDetails = study.details ?? {};
  const relevance = details.relevance as StudyRelevance | undefined;
  const processingStatus = getStudyProcessingStatusView(study);
  const citationParts = [study.authors, String(study.year)];

  if (details.journal) {
    citationParts.push(details.journal);
  }

  const summary = details.aiSummary?.trim() || details.abstract?.trim() || null;
  const containerClassName = [
    styles.container,
    mode === "preview" ? styles.preview : styles.full,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={containerClassName}>
      <div className={styles.badges} aria-label="Study status summary">
        <span
          className={`${styles.badge} ${
            processingStatus.tone === "success"
              ? styles.badgeSuccess
              : processingStatus.tone === "info"
                ? styles.badgeInfo
                : processingStatus.tone === "danger"
                  ? styles.badgeDanger
                  : styles.badgeNeutral
          }`}
          title={processingStatus.description}
        >
          {processingStatus.label}
        </span>
        <span
          className={`${styles.badge} ${
            study.quality === "High"
              ? styles.badgeQualityHigh
              : study.quality === "Medium"
                ? styles.badgeQualityMedium
                : styles.badgeNeutral
          }`}
        >
          Quality: {study.quality}
        </span>
        <span
          className={`${styles.badge} ${
            details.triageDecision === "keep"
              ? styles.badgeTriageKeep
              : details.triageDecision === "exclude"
                ? styles.badgeTriageExclude
                : details.triageDecision === "maybe"
                  ? styles.badgeTriageMaybe
                  : styles.badgeNeutral
          }`}
        >
          Triage: {getTriageLabel(details.triageDecision)}
        </span>
        <span
          className={`${styles.badge} ${
            relevance?.band === "high"
              ? styles.badgeRelevanceHigh
              : relevance?.band === "moderate"
                ? styles.badgeRelevanceModerate
                : relevance?.band === "low"
                  ? styles.badgeRelevanceLow
                  : styles.badgeNeutral
          }`}
        >
          Relevance: {getRelevanceLabel(relevance)}
        </span>
      </div>

      <p className={styles.citation}>{citationParts.join(" · ")}</p>

      {showProcessingDescription ? (
        <p className={styles.processingDescription}>{processingStatus.description}</p>
      ) : null}

      <StudyQuickInfo study={study} />

      {showSummary && summary ? (
        <div className={styles.summaryBlock}>
          <p className={styles.sectionLabel}>
            {details.aiSummary ? "AI Summary" : "Abstract"}
          </p>
          <p
            className={`${styles.summaryText} ${
              mode === "preview" ? styles.summaryTextPreview : ""
            }`}
          >
            {summary}
          </p>
        </div>
      ) : null}

      {showSummary && !summary ? (
        <div className={styles.summaryBlock}>
          <p className={styles.sectionLabel}>Summary</p>
          <p className={styles.emptyState}>No summary available yet.</p>
        </div>
      ) : null}

      {details.exclusionReason ? (
        <div className={styles.summaryBlock}>
          <p className={styles.sectionLabel}>Exclusion Reason</p>
          <p className={styles.exclusionReason}>{details.exclusionReason}</p>
        </div>
      ) : null}
    </section>
  );
}
