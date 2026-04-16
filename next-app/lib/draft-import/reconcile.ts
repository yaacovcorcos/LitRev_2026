import {
  createDefaultDraftState,
  emptyDoc,
  normalizeDraftState,
  type DraftState,
  type DraftStateInput,
} from "@/lib/draft-storage";
import { mergeAuxiliaryBibliography } from "@/lib/draft-import/bibliography";
import type { DraftAuxiliaryReference, DraftImportResult } from "@/lib/draft-import/types";
import { DEFAULT_SECTION_FORMAT } from "@/lib/draft-storage";
import { UNSECTIONED_DRAFT_ID, type DraftSectionId } from "@/types/draft";

export type DraftImportApplyPlan =
  | {
      kind: "noop";
      nextDraft: DraftState;
      bibliography: DraftAuxiliaryReference[];
      changed: false;
    }
  | {
      kind: "merge_bibliography";
      nextDraft: DraftState;
      bibliography: DraftAuxiliaryReference[];
      changed: true;
    }
  | {
      kind: "replace_manuscript";
      nextDraft: DraftState;
      bibliography: DraftAuxiliaryReference[];
      changed: true;
    };

function createFormatting(sectionIds: DraftSectionId[], currentDraft: DraftState) {
  const formatting: DraftState["formattingBySection"] = {};
  for (const sectionId of sectionIds) {
    formatting[sectionId] = currentDraft.formattingBySection[sectionId]
      ?? currentDraft.formattingBySection[UNSECTIONED_DRAFT_ID]
      ?? { ...DEFAULT_SECTION_FORMAT };
  }
  return formatting;
}

function createSectionDraftState(currentDraft: DraftState, result: DraftImportResult, bibliography: DraftAuxiliaryReference[]): DraftState {
  const hasWholeDraftOnly =
    result.sections.length === 1
    && result.sections[0]?.sectionId === UNSECTIONED_DRAFT_ID;

  const sectionOrder = hasWholeDraftOnly
    ? []
    : result.sections
        .map((section) => section.sectionId)
        .filter((sectionId): sectionId is DraftSectionId => Boolean(sectionId) && sectionId !== UNSECTIONED_DRAFT_ID);

  const customSections = Object.fromEntries(
    result.sections
      .filter((section) => section.isCustom && section.sectionId && section.sectionId !== UNSECTIONED_DRAFT_ID)
      .map((section) => [section.sectionId as DraftSectionId, { label: section.label }]),
  ) as DraftState["customSections"];

  const contentBySection: DraftState["contentBySection"] = {
    [UNSECTIONED_DRAFT_ID]: emptyDoc(),
  };

  if (hasWholeDraftOnly) {
    contentBySection[UNSECTIONED_DRAFT_ID] = {
      type: "doc",
      content: result.sections[0]?.blocks.length ? result.sections[0].blocks : [{ type: "paragraph" }],
    };
  } else {
    for (const section of result.sections) {
      if (!section.sectionId || section.sectionId === UNSECTIONED_DRAFT_ID) continue;
      contentBySection[section.sectionId] = {
        type: "doc",
        content: section.blocks.length > 0 ? section.blocks : [{ type: "paragraph" }],
      };
    }
  }

  const knownSectionIds = [
    UNSECTIONED_DRAFT_ID,
    ...sectionOrder,
    ...Object.keys(customSections),
  ] as DraftSectionId[];

  return normalizeDraftState({
    version: 2,
    mode: hasWholeDraftOnly ? "full" : "section",
    activeSection: hasWholeDraftOnly ? null : sectionOrder[0] ?? null,
    sectionOrder,
    customSections,
    formattingBySection: createFormatting(knownSectionIds, currentDraft),
    panels: currentDraft.panels,
    contentBySection,
    ledgerBySection: Object.fromEntries(knownSectionIds.map((sectionId) => [sectionId, []])),
    copilotBySection: Object.fromEntries(knownSectionIds.map((sectionId) => [sectionId, []])),
    auxiliaryBibliography: bibliography,
    manuscript: currentDraft.manuscript,
  });
}

export function buildDraftImportApplyPlan(
  currentDraftInput: DraftStateInput | null | undefined,
  result: DraftImportResult,
): DraftImportApplyPlan {
  const currentDraft = currentDraftInput ? normalizeDraftState(currentDraftInput) : createDefaultDraftState();
  const bibliography = mergeAuxiliaryBibliography(currentDraft.auxiliaryBibliography ?? [], result.bibliography);

  if (result.kind === "bibliography") {
    if (bibliography.length === (currentDraft.auxiliaryBibliography?.length ?? 0)) {
      return {
        kind: "noop",
        nextDraft: currentDraft,
        bibliography,
        changed: false,
      };
    }

    return {
      kind: "merge_bibliography",
      nextDraft: normalizeDraftState({
        ...currentDraft,
        auxiliaryBibliography: bibliography,
      }),
      bibliography,
      changed: true,
    };
  }

  return {
    kind: "replace_manuscript",
    nextDraft: createSectionDraftState(currentDraft, result, bibliography),
    bibliography,
    changed: true,
  };
}
