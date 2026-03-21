import type { JSONContent } from "@tiptap/core";
import type { CitationIssueType } from "@/lib/citation-compiler";
import type {
  DraftDiagnosticsReport,
  DraftReadinessDiagnosticCode,
} from "@/lib/draft-diagnostics/model";
import type { DraftSectionId } from "@/types/draft";

export type DraftExportFormat = "docx" | "markdown";
export type DraftExportMode = "warn" | "strict";

export type CompiledDraftExportWarning = {
  type: CitationIssueType | DraftReadinessDiagnosticCode;
  severity: "warning" | "error";
  sectionId?: DraftSectionId;
  studyId?: string;
  message: string;
};

export type CompiledDraftReferenceEntry = {
  studyId: string;
  number: number;
  text: string;
  missingStudy: boolean;
};

export type CompiledDraftExportSection = {
  id: DraftSectionId;
  label: string;
  doc: JSONContent;
  isWholeDraft: boolean;
};

export type CompiledDraftExportDocument = {
  projectTitle: string;
  exportedAt: string;
  sections: CompiledDraftExportSection[];
  references: CompiledDraftReferenceEntry[];
  diagnostics: DraftDiagnosticsReport;
  warnings: CompiledDraftExportWarning[];
  blockingWarningCount: number;
};

export function formatExportDate(exportedAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(exportedAt));
}
