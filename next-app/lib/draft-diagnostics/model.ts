import type { CitationIssueType } from "@/lib/citation-compiler";
import type { DraftSectionId } from "@/types/draft";

export type DraftDiagnosticSeverity = "error" | "warning" | "info";

export type DraftReadinessDiagnosticCode =
  | "section_missing_citation_readiness"
  | "section_ledger_unused_readiness"
  | "draft_no_exportable_sections";

export type DraftCitationDiagnostic = {
  kind: "citation";
  code: CitationIssueType;
  severity: DraftDiagnosticSeverity;
  sectionId: DraftSectionId;
  uid: string;
  studyId?: string;
  message: string;
};

export type DraftReadinessDiagnostic = {
  kind: "readiness";
  code: DraftReadinessDiagnosticCode;
  severity: "warning";
  sectionId?: DraftSectionId;
  studyId?: string;
  message: string;
};

export type DraftDiagnostic = DraftCitationDiagnostic | DraftReadinessDiagnostic;

export type DraftSectionDiagnostics = {
  sectionId: DraftSectionId;
  hasMeaningfulContent: boolean;
  citationCount: number;
  ledgerStudyCount: number;
  diagnostics: DraftDiagnostic[];
};

export type DraftDiagnosticsSummary = {
  totalCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  citationIssueCount: number;
  readinessIssueCount: number;
  blockingCitationIssueCount: number;
  byCitationIssueType: Partial<Record<CitationIssueType, number>>;
  byReadinessCode: Partial<Record<DraftReadinessDiagnosticCode, number>>;
};

export type DraftDiagnosticsReport = {
  diagnostics: DraftDiagnostic[];
  sectionDiagnostics: DraftSectionDiagnostics[];
  summary: DraftDiagnosticsSummary;
};
