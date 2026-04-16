import type { JSONContent } from "@tiptap/core";
import type { DraftSectionId } from "@/types/draft";

export type DraftImportSourceFormat =
  | "docx"
  | "markdown"
  | "html"
  | "csv"
  | "tsv"
  | "csl-json"
  | "ris"
  | "bibtex"
  | "legacy-draft";

export type DraftImportKind = "manuscript" | "bibliography" | "mixed";
export type DraftImportWarningSeverity = "info" | "warning" | "error";
export type DraftImportPreservationClass = "preserved" | "downgraded" | "unresolved" | "dropped";

export type DraftImportSummary = {
  preserved: string[];
  downgraded: string[];
  unresolved: string[];
};

export type DraftImportReportEntry = {
  code: string;
  severity: DraftImportWarningSeverity;
  preservation: DraftImportPreservationClass;
  message: string;
  sourceFormat: DraftImportSourceFormat;
  sourceLabel?: string;
  detail?: string;
  sectionLabel?: string;
  citationKey?: string;
  objectType?: string;
};

export type DraftAuxiliaryReference = {
  id: string;
  sourceFormat: DraftImportSourceFormat | "manual";
  sourceItemId?: string;
  citationKey?: string;
  title: string;
  authors?: string;
  year?: number;
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  pmid?: string;
  linkedStudyId?: string;
};

export type DraftImportedSection = {
  label: string;
  sectionId?: DraftSectionId;
  isCustom: boolean;
  placeholder?: string;
  blocks: JSONContent[];
  sourceHeadingLevel?: number;
};

export type DraftImportResult = {
  format: DraftImportSourceFormat;
  kind: DraftImportKind;
  sourceLabel: string;
  title?: string;
  sections: DraftImportedSection[];
  bibliography: DraftAuxiliaryReference[];
  summary: DraftImportSummary;
  report: DraftImportReportEntry[];
  stats: {
    sectionCount: number;
    blockCount: number;
    bibliographyCount: number;
  };
};

export type DraftImportPayload = {
  format: DraftImportSourceFormat;
  filename?: string;
  text?: string;
  bytes?: Uint8Array;
};
