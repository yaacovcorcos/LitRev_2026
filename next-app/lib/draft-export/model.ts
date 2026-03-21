import type { JSONContent } from "@tiptap/core";
import type { CitationIssue } from "@/lib/citation-compiler";
import type { DraftSectionId } from "@/types/draft";

export type DraftExportFormat = "docx" | "markdown";
export type DraftExportMode = "warn" | "strict";

export type CompiledDraftExportWarning = {
  type: CitationIssue["type"];
  severity: "warning" | "error";
  sectionId: DraftSectionId;
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
