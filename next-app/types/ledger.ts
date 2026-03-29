export type StudyStatus = "pending" | "extracted" | "active" | "excluded";
export type StudyProcessingPhase = "quick_extract" | "deep_analysis";
export type StudyProcessingState = "idle" | "queued" | "running" | "succeeded" | "failed";
export type StudyProcessingPriority = "background" | "foreground";
export type StudyProcessingRequestSource =
  | "auto_import"
  | "manual_extract"
  | "manual_analyze"
  | "study_page_focus"
  | "ai_tool";
export type StudyProcessingNextAction = "extract" | "analyze" | "retry" | "wait" | "none";

export type StudyProcessingPhaseSnapshot = {
  jobId?: string;
  phase: StudyProcessingPhase;
  state: StudyProcessingState;
  priority?: StudyProcessingPriority;
  requestSource?: StudyProcessingRequestSource;
  attemptCount: number;
  requestedAt?: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
};

export type StudyProcessingSnapshot = {
  byPhase: {
    quickExtract: StudyProcessingPhaseSnapshot;
    deepAnalysis: StudyProcessingPhaseSnapshot;
  };
  currentPhase?: StudyProcessingPhase;
  currentState: StudyProcessingState;
  nextAction: StudyProcessingNextAction;
  prerequisitesSatisfied: {
    deepAnalysis: boolean;
  };
};

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
export type ScreeningTier = "deterministic" | "ai" | "heuristic" | "default";
export type RelevanceBand = "high" | "moderate" | "low";

export type StudyRelevance = {
  score: number; // 0-100
  band: RelevanceBand;
  rationale: string;
  components?: {
    protocolFit?: number;
    designFit?: number;
    outcomeDirectness?: number;
    applicability?: number;
    completeness?: number;
  };
};

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
  sourceUrl?: string;

  // Classification
  keywords?: string[];
  studyType?: StudyType;

  // Triage / Screening
  triageDecision?: TriageDecision;
  exclusionReason?: string;
  triageNote?: string;
  triageDate?: string; // ISO date string
  screeningMeta?: {
    tier: ScreeningTier;
    modelConfidence: number;
    reasons: string[];
    screenedAt: string;
    modelUsed?: string;
  };

  // AI features
  aiSummary?: string;
  qualityRationale?: string;
  relevance?: StudyRelevance;
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
  processing?: StudyProcessingSnapshot;
};
