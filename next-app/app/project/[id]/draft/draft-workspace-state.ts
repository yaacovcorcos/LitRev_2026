import type { JSONContent } from "@tiptap/core";
import { buildReferencesDoc, compileDraftCitations, type CitationIssue } from "@/lib/citation-compiler";
import type { DraftState } from "@/lib/draft-storage";
import { buildCompatContentBySection, createManuscriptDocument } from "@/lib/manuscript/schema";
import type { Study } from "@/types/ledger";

function withManuscriptContent(state: DraftState, contentBySection: DraftState["contentBySection"]): DraftState {
  const manuscript = createManuscriptDocument({
    sectionOrder: state.sectionOrder,
    customSections: state.customSections,
    contentBySection,
  });
  return {
    ...state,
    contentBySection: buildCompatContentBySection(manuscript),
    manuscript,
  };
}

export function applyManuscriptDocToDraftState(state: DraftState, manuscriptDoc: JSONContent): DraftState {
  return withManuscriptContent(state, buildCompatContentBySection({
    ...state.manuscript,
    doc: manuscriptDoc,
  }));
}

export function synchronizeDraftState(params: {
  state: DraftState;
  studies: Study[];
  includeNumberInNodes: boolean;
}): DraftState {
  const { state, studies, includeNumberInNodes } = params;
  const compiled = compileDraftCitations({
    contentBySection: state.contentBySection,
    sectionOrder: state.sectionOrder,
    studies,
    includeNumberInNodes,
  });
  return withManuscriptContent(state, {
    ...compiled.normalizedContentBySection,
    references: buildReferencesDoc(compiled.orderedStudyIds, studies),
  });
}

export function getDraftCitationIssues(state: DraftState, studies: Study[]): CitationIssue[] {
  return compileDraftCitations({
    contentBySection: state.contentBySection,
    sectionOrder: state.sectionOrder,
    studies,
    includeNumberInNodes: true,
  }).issues;
}
