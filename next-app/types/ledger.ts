export type StudyStatus = "pending" | "extracted";

export type StudyType =
  | "RCT"
  | "Cohort"
  | "Case-Control"
  | "Cross-Sectional"
  | "Case-Report"
  | "Meta-Analysis"
  | "Systematic-Review"
  | "Other";

export type StudySource = "manual" | "pdf-import" | "pubmed" | "copilot";

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

  // AI features (future)
  aiSummary?: string;

  // Source tracking
  source?: StudySource;
  verified?: boolean;

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
