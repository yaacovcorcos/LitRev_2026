import { compileDraftCitations } from "@/lib/citation-compiler";
import { compileDraftDiagnosticsFromNormalized } from "@/lib/draft-diagnostics/compile";
import type { DraftDiagnostic } from "@/lib/draft-diagnostics/model";
import { formatBibliographyEntries } from "@/lib/citation-formatting";
import { normalizeDraftState, type DraftStateInput } from "@/lib/draft-storage";
import {
  draftSectionHasMeaningfulContent,
  getVisibleFullDraftSectionIds,
} from "@/lib/draft-state-contracts";
import type { Study } from "@/types/ledger";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";
import type {
  CompiledDraftExportDocument,
  CompiledDraftExportWarning,
} from "./model";

function toWarning(diagnostic: DraftDiagnostic): CompiledDraftExportWarning {
  return {
    type: diagnostic.code,
    severity: diagnostic.severity === "error" ? "error" : "warning",
    sectionId: diagnostic.sectionId,
    studyId: diagnostic.studyId,
    message: diagnostic.message,
  };
}

export function compileDraftExportDocument(params: {
  projectTitle: string;
  draftSnapshot: DraftStateInput;
  studies: Study[];
  exportedAt?: string;
}): CompiledDraftExportDocument {
  const normalizedDraft = normalizeDraftState(params.draftSnapshot);
  const exportedAt = params.exportedAt ?? new Date().toISOString();
  const compiledCitations = compileDraftCitations({
    contentBySection: normalizedDraft.contentBySection,
    sectionOrder: normalizedDraft.sectionOrder,
    studies: params.studies,
    includeNumberInNodes: true,
  });
  const diagnostics = compileDraftDiagnosticsFromNormalized({
    draft: normalizedDraft,
    compiledCitations,
  });
  const sectionMetaById = new Map(
    normalizedDraft.manuscript.sections.map((section) => [section.sectionId, section]),
  );

  const visibleSectionIds = getVisibleFullDraftSectionIds(
    normalizedDraft.sectionOrder,
    compiledCitations.normalizedContentBySection,
  ).filter((sectionId) => sectionId !== "references");

  if (
    visibleSectionIds.length === 0 &&
    draftSectionHasMeaningfulContent(compiledCitations.normalizedContentBySection[UNSECTIONED_DRAFT_ID])
  ) {
    visibleSectionIds.push(UNSECTIONED_DRAFT_ID);
  }

  const sections = visibleSectionIds.map((sectionId) => {
    const meta = sectionMetaById.get(sectionId);
    return {
      id: sectionId,
      label: meta?.label ?? (sectionId === UNSECTIONED_DRAFT_ID ? "Whole draft" : sectionId),
      doc: compiledCitations.normalizedContentBySection[sectionId] ?? normalizedDraft.contentBySection[sectionId],
      isWholeDraft: sectionId === UNSECTIONED_DRAFT_ID,
    };
  });

  const references = formatBibliographyEntries({
    orderedStudyIds: compiledCitations.orderedStudyIds,
    studies: params.studies,
  });
  const warnings = diagnostics.diagnostics.map(toWarning);

  return {
    projectTitle: params.projectTitle,
    exportedAt,
    sections,
    references,
    diagnostics,
    warnings,
    blockingWarningCount: diagnostics.summary.blockingCitationIssueCount,
  };
}
