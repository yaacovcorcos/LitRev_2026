export type StudyStatus = "pending" | "extracted" | "active" | "excluded";

export type StudyType =
  | "RCT"
  | "Cohort"
  | "Case-Control"
  | "Cross-Sectional"
  | "Case-Report"
  | "Meta-Analysis"
  | "Systematic-Review"
  | "Other";

export type StudySource = "manual" | "pdf-import" | "pubmed" | "semantic-scholar" | "copilot";

/**
 * Triage decision for screening workflow.
 * - "keep": Study will be included in the review
 * - "exclude": Study is rejected (requires exclusionReason)
 * - "maybe": Needs second look or discussion
 */
export type TriageDecision = "keep" | "exclude" | "maybe";

/**
 * Extended metadata stored in Study.details JSON field.
 * This avoids Prisma migration while supporting rich study data.
 */
export type StudyDetails = {
  // Bibliographic metadata
  abstract?: string;
  doi?: string;
  pmid?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;

  // Classification
  keywords?: string[];
  studyType?: StudyType;

  // Triage / Screening
  triageDecision?: TriageDecision;
  exclusionReason?: string;
  triageNote?: string;
  triageDate?: string; // ISO date string

  // AI features
  aiSummary?: string;
  qualityRationale?: string;
  deepAnalysisComplete?: boolean;

  // Source tracking
  source?: StudySource;
  verified?: boolean;

  // Protocol criteria matching (computed on demand)
  criteriaMatch?: {
    /** Matches protocol time frame */
    matchesYearRange?: boolean;
    /** Matches protocol study designs */
    matchesStudyDesign?: boolean;
    /** Overall eligibility score (0-100) */
    eligibilityScore?: number;
    /** Reasons for exclusion based on protocol */
    exclusionReasons?: string[];
    /** Last time criteria was checked */
    checkedAt?: string;
  };

  // Extensible
  [key: string]: unknown;
};

export type Study = {
  id: string;
  title: string;
  authors: string;
  year: number;
  status: StudyStatus;
  quality: "High" | "Medium" | "Low" | "-";
  details?: StudyDetails;
};
