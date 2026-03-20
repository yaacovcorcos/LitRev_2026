import type { JSONContent } from "@tiptap/core";
import type { DraftMode, DraftSectionId } from "@/types/draft";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";

export function draftSectionHasMeaningfulContent(doc: JSONContent | null | undefined): boolean {
  if (!doc || typeof doc !== "object") return false;
  const stack: JSONContent[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.type === "text" && typeof node.text === "string" && node.text.trim().length > 0) {
      return true;
    }
    if (node.type === "citation" || node.type === "hardBreak") {
      return true;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        if (child && typeof child === "object") {
          stack.push(child);
        }
      }
    }
  }
  return false;
}

export function isWritableDraftSectionId(sectionId: DraftSectionId | null | undefined): sectionId is DraftSectionId {
  return typeof sectionId === "string" && sectionId.length > 0 && sectionId !== "references" && sectionId !== UNSECTIONED_DRAFT_ID;
}

export function getWritableDraftSectionIds(sectionOrder: DraftSectionId[]): DraftSectionId[] {
  return sectionOrder.filter((sectionId) => isWritableDraftSectionId(sectionId));
}

export function canUseDraftSectionMode(sectionOrder: DraftSectionId[]): boolean {
  return getWritableDraftSectionIds(sectionOrder).length > 0;
}

export function getFirstWritableDraftSectionId(sectionOrder: DraftSectionId[]): DraftSectionId | null {
  return getWritableDraftSectionIds(sectionOrder)[0] ?? null;
}

export function isVisibleInFullDraft(
  sectionId: DraftSectionId,
  contentBySection: Record<DraftSectionId, JSONContent>,
): boolean {
  if (sectionId === "references") {
    return false;
  }
  return draftSectionHasMeaningfulContent(contentBySection[sectionId]);
}

export function getVisibleFullDraftSectionIds(
  sectionOrder: DraftSectionId[],
  contentBySection: Record<DraftSectionId, JSONContent>,
): DraftSectionId[] {
  const visible = sectionOrder.filter((sectionId) => isVisibleInFullDraft(sectionId, contentBySection));
  if (
    sectionOrder.includes("references")
    && draftSectionHasMeaningfulContent(contentBySection.references)
  ) {
    visible.push("references");
  }
  return visible;
}

export function resolveDraftMode(mode: DraftMode, sectionOrder: DraftSectionId[]): DraftMode {
  return canUseDraftSectionMode(sectionOrder) ? mode : "full";
}

export function resolveSectionModeActiveSection(
  activeSection: DraftSectionId | null,
  sectionOrder: DraftSectionId[],
): DraftSectionId | null {
  if (!canUseDraftSectionMode(sectionOrder)) return null;
  if (activeSection === "references" && sectionOrder.includes("references")) {
    return "references";
  }
  return isWritableDraftSectionId(activeSection) && sectionOrder.includes(activeSection)
    ? activeSection
    : getFirstWritableDraftSectionId(sectionOrder);
}

export function resolveFullDraftActiveSection(
  activeSection: DraftSectionId | null,
  sectionOrder: DraftSectionId[],
): DraftSectionId | null {
  if (typeof activeSection === "string" && sectionOrder.includes(activeSection)) {
    return activeSection;
  }
  return getFirstWritableDraftSectionId(sectionOrder) ?? sectionOrder[0] ?? null;
}

export function resolveDraftEvidenceTarget(
  mode: DraftMode,
  activeSection: DraftSectionId | null,
  sectionOrder: DraftSectionId[],
): DraftSectionId {
  if (!canUseDraftSectionMode(sectionOrder)) {
    return UNSECTIONED_DRAFT_ID;
  }
  if (mode === "section") {
    return isWritableDraftSectionId(activeSection) && sectionOrder.includes(activeSection)
      ? activeSection
      : UNSECTIONED_DRAFT_ID;
  }
  return isWritableDraftSectionId(activeSection) && sectionOrder.includes(activeSection)
    ? activeSection
    : UNSECTIONED_DRAFT_ID;
}
