import {
  compileDraftCitations,
  hasBlockingCitationIssues,
  type CitationIssue,
  type CompiledCitations,
  type ResolvedCitationNode,
} from "@/lib/citation-compiler";
import { normalizeDraftState, type DraftState, type DraftStateInput } from "@/lib/draftStorage";
import {
  draftSectionHasMeaningfulContent,
  getVisibleFullDraftSectionIds,
} from "@/lib/draftStateContracts";
import { UNSECTIONED_DRAFT_ID, type DraftSectionId } from "@/types/draft";
import type { Study } from "@/types/ledger";
import type {
  DraftCitationDiagnostic,
  DraftDiagnostic,
  DraftDiagnosticsReport,
  DraftReadinessDiagnostic,
  DraftReadinessDiagnosticCode,
  DraftSectionDiagnostics,
} from "./model";

function toCitationDiagnostic(issue: CitationIssue): DraftCitationDiagnostic {
  return {
    kind: "citation",
    code: issue.type,
    severity: issue.type === "missing_study" || issue.type === "missing_study_id" ? "error" : "warning",
    sectionId: issue.sectionId,
    uid: issue.uid,
    studyId: issue.studyId,
    message: issue.message,
  };
}

function buildDiagnosticSectionOrder(draft: DraftState): DraftSectionId[] {
  const ordered: DraftSectionId[] = [];
  const seen = new Set<DraftSectionId>();
  const maybePush = (sectionId: DraftSectionId) => {
    if (sectionId === "references" || seen.has(sectionId)) return;
    seen.add(sectionId);
    ordered.push(sectionId);
  };

  if (UNSECTIONED_DRAFT_ID in draft.contentBySection) {
    maybePush(UNSECTIONED_DRAFT_ID);
  }
  for (const sectionId of draft.sectionOrder) {
    maybePush(sectionId);
  }
  for (const sectionId of Object.keys(draft.contentBySection)) {
    maybePush(sectionId as DraftSectionId);
  }
  return ordered;
}

function buildCitationsBySection(citations: ResolvedCitationNode[]): Map<DraftSectionId, ResolvedCitationNode[]> {
  const citationsBySection = new Map<DraftSectionId, ResolvedCitationNode[]>();
  for (const citation of citations) {
    const sectionCitations = citationsBySection.get(citation.sectionId) ?? [];
    sectionCitations.push(citation);
    citationsBySection.set(citation.sectionId, sectionCitations);
  }
  return citationsBySection;
}

function createReadinessDiagnostic(params: {
  code: DraftReadinessDiagnosticCode;
  message: string;
  sectionId?: DraftSectionId;
  studyId?: string;
}): DraftReadinessDiagnostic {
  return {
    kind: "readiness",
    code: params.code,
    severity: "warning",
    sectionId: params.sectionId,
    studyId: params.studyId,
    message: params.message,
  };
}

function buildReadinessDiagnostics(params: {
  draft: DraftState;
  compiledCitations: CompiledCitations;
  sectionIds: DraftSectionId[];
  citationsBySection: Map<DraftSectionId, ResolvedCitationNode[]>;
}): DraftReadinessDiagnostic[] {
  const { draft, compiledCitations, sectionIds, citationsBySection } = params;
  const readinessDiagnostics: DraftReadinessDiagnostic[] = [];

  for (const sectionId of sectionIds) {
    const content =
      compiledCitations.normalizedContentBySection[sectionId] ?? draft.contentBySection[sectionId];
    const hasMeaningfulContent = draftSectionHasMeaningfulContent(content);
    if (!hasMeaningfulContent) continue;

    const sectionCitations = citationsBySection.get(sectionId) ?? [];
    const citationCount = sectionCitations.length;
    const ledgerStudyIds = draft.ledgerBySection[sectionId] ?? [];
    const citedStudyIds = new Set(
      sectionCitations
        .map((citation) => citation.studyId)
        .filter((studyId): studyId is string => typeof studyId === "string" && studyId.length > 0),
    );

    if (citationCount === 0) {
      readinessDiagnostics.push(
        createReadinessDiagnostic({
          code: "section_missing_citation_readiness",
          sectionId,
          message: `Section ${sectionId} has meaningful content but no inline citations.`,
        }),
      );
    }

    if (ledgerStudyIds.length > 0 && !ledgerStudyIds.some((studyId) => citedStudyIds.has(studyId))) {
      readinessDiagnostics.push(
        createReadinessDiagnostic({
          code: "section_ledger_unused_readiness",
          sectionId,
          message: `Section ${sectionId} has linked evidence but no matching inline citations.`,
        }),
      );
    }
  }

  const visibleSectionIds = getVisibleFullDraftSectionIds(
    draft.sectionOrder,
    compiledCitations.normalizedContentBySection,
  ).filter((sectionId) => sectionId !== "references");

  if (
    visibleSectionIds.length === 0 &&
    !draftSectionHasMeaningfulContent(compiledCitations.normalizedContentBySection[UNSECTIONED_DRAFT_ID])
  ) {
    readinessDiagnostics.push(
      createReadinessDiagnostic({
        code: "draft_no_exportable_sections",
        message: "Draft has no exportable sections yet.",
      }),
    );
  }

  return readinessDiagnostics;
}

function buildSectionDiagnostics(params: {
  draft: DraftState;
  compiledCitations: CompiledCitations;
  diagnostics: DraftDiagnostic[];
  sectionIds: DraftSectionId[];
  citationsBySection: Map<DraftSectionId, ResolvedCitationNode[]>;
}): DraftSectionDiagnostics[] {
  const { draft, compiledCitations, diagnostics, sectionIds, citationsBySection } = params;
  return sectionIds.map((sectionId) => {
    const content =
      compiledCitations.normalizedContentBySection[sectionId] ?? draft.contentBySection[sectionId];
    return {
      sectionId,
      hasMeaningfulContent: draftSectionHasMeaningfulContent(content),
      citationCount: (citationsBySection.get(sectionId) ?? []).length,
      ledgerStudyCount: draft.ledgerBySection[sectionId]?.length ?? 0,
      diagnostics: diagnostics.filter((diagnostic) => diagnostic.sectionId === sectionId),
    };
  });
}

function buildDiagnosticsReport(params: {
  draft: DraftState;
  compiledCitations: CompiledCitations;
}): DraftDiagnosticsReport {
  const { draft, compiledCitations } = params;
  const sectionIds = buildDiagnosticSectionOrder(draft);
  const citationsBySection = buildCitationsBySection(compiledCitations.citations);
  const citationDiagnostics = compiledCitations.issues.map(toCitationDiagnostic);
  const readinessDiagnostics = buildReadinessDiagnostics({
    draft,
    compiledCitations,
    sectionIds,
    citationsBySection,
  });
  const diagnostics: DraftDiagnostic[] = [...citationDiagnostics, ...readinessDiagnostics];

  const byCitationIssueType: DraftDiagnosticsReport["summary"]["byCitationIssueType"] = {};
  const byReadinessCode: DraftDiagnosticsReport["summary"]["byReadinessCode"] = {};
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let citationIssueCount = 0;
  let readinessIssueCount = 0;

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error") errorCount += 1;
    else if (diagnostic.severity === "warning") warningCount += 1;
    else infoCount += 1;

    if (diagnostic.kind === "citation") {
      citationIssueCount += 1;
      byCitationIssueType[diagnostic.code] = (byCitationIssueType[diagnostic.code] ?? 0) + 1;
    } else {
      readinessIssueCount += 1;
      byReadinessCode[diagnostic.code] = (byReadinessCode[diagnostic.code] ?? 0) + 1;
    }
  }

  return {
    diagnostics,
    sectionDiagnostics: buildSectionDiagnostics({
      draft,
      compiledCitations,
      diagnostics,
      sectionIds,
      citationsBySection,
    }),
    summary: {
      totalCount: diagnostics.length,
      errorCount,
      warningCount,
      infoCount,
      citationIssueCount,
      readinessIssueCount,
      blockingCitationIssueCount: hasBlockingCitationIssues(compiledCitations.issues)
        ? citationDiagnostics.filter((diagnostic) => diagnostic.severity === "error").length
        : 0,
      byCitationIssueType,
      byReadinessCode,
    },
  };
}

export function compileDraftDiagnostics(params: {
  draftSnapshot: DraftStateInput;
  studies: Study[];
}): DraftDiagnosticsReport {
  const draft = normalizeDraftState(params.draftSnapshot);
  const compiledCitations = compileDraftCitations({
    contentBySection: draft.contentBySection,
    sectionOrder: draft.sectionOrder,
    studies: params.studies,
    includeNumberInNodes: true,
  });
  return buildDiagnosticsReport({
    draft,
    compiledCitations,
  });
}

export function compileDraftDiagnosticsFromNormalized(params: {
  draft: DraftState;
  compiledCitations: CompiledCitations;
}): DraftDiagnosticsReport {
  return buildDiagnosticsReport(params);
}
