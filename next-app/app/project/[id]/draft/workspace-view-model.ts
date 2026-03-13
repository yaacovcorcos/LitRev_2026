import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { CitationIssue } from "@/lib/citation-compiler";
import type { DraftState } from "@/lib/draftStorage";
import { docHasContent } from "./draft-helpers";
import { MANUSCRIPT_SECTION_NODE_TYPE, type ManuscriptOutlineEntry } from "@/types/manuscript";
import type { DraftSectionId } from "@/types/draft";

export type DraftSelectionState = {
  activeSection: DraftSectionId;
  activeBlockId: string | null;
};

export type DraftSectionStatus = "empty" | "drafting" | "issues" | "generated";

export type DraftOutlineViewModel = ManuscriptOutlineEntry & {
  status: DraftSectionStatus;
  issueCount: number;
};

export type DraftEditorBlockEntry = {
  blockId: string;
  sectionId: DraftSectionId;
  from: number;
  to: number;
  focusPos: number;
  nodeType: string;
  index: number;
};

export type DraftEditorSectionEntry = {
  sectionId: DraftSectionId;
  nodePos: number;
  from: number;
  to: number;
  focusPos: number;
  headingPositions: Record<string, number>;
  blockIds: string[];
};

export type DraftEditorMap = {
  sections: Record<DraftSectionId, DraftEditorSectionEntry>;
  blocks: Record<string, DraftEditorBlockEntry>;
};

function focusPosForRange(from: number, to: number): number {
  return Math.max(from + 1, Math.min(to, from + 1));
}

export function buildDraftOutlineViewModel(params: {
  draft: DraftState;
  outline: ManuscriptOutlineEntry[];
  citationIssues: CitationIssue[];
}): DraftOutlineViewModel[] {
  const { draft, outline, citationIssues } = params;
  const issueCountBySection = citationIssues.reduce<Record<DraftSectionId, number>>((counts, issue) => {
    counts[issue.sectionId] = (counts[issue.sectionId] ?? 0) + 1;
    return counts;
  }, {});

  return outline.map((section) => {
    const issueCount = issueCountBySection[section.sectionId] ?? 0;
    let status: DraftSectionStatus = "drafting";
    if (section.sectionId === "references") {
      status = "generated";
    } else if (issueCount > 0) {
      status = "issues";
    } else if (!docHasContent(draft.contentBySection[section.sectionId])) {
      status = "empty";
    }
    return {
      ...section,
      status,
      issueCount,
    };
  });
}

export function buildDraftEditorMap(doc: ProseMirrorNode): DraftEditorMap {
  const sections: Record<DraftSectionId, DraftEditorSectionEntry> = {};
  const blocks: Record<string, DraftEditorBlockEntry> = {};

  doc.forEach((sectionNode, sectionOffset) => {
    if (sectionNode.type.name !== MANUSCRIPT_SECTION_NODE_TYPE) return;
    const sectionId = sectionNode.attrs.sectionId as DraftSectionId | undefined;
    if (!sectionId) return;
    const nodePos = sectionOffset;
    const from = nodePos + 1;
    const to = nodePos + sectionNode.nodeSize - 1;
    const headingPositions: Record<string, number> = {};
    const blockIds: string[] = [];

    sectionNode.forEach((childNode, childOffset, childIndex) => {
      const blockId = typeof childNode.attrs?.blockId === "string" ? childNode.attrs.blockId : null;
      const childPos = nodePos + 1 + childOffset;
      const childTo = childPos + childNode.nodeSize;
      if (blockId) {
        blockIds.push(blockId);
        blocks[blockId] = {
          blockId,
          sectionId,
          from: childPos,
          to: childTo,
          focusPos: focusPosForRange(childPos, childTo - 1),
          nodeType: childNode.type.name,
          index: childIndex,
        };
      }
      if (childNode.type.name === "heading") {
        const headingId = blockId ?? `heading:${sectionId}:${childIndex}`;
        headingPositions[headingId] = focusPosForRange(childPos, childTo - 1);
      }
    });

    sections[sectionId] = {
      sectionId,
      nodePos,
      from,
      to,
      focusPos: from,
      headingPositions,
      blockIds,
    };
  });

  return { sections, blocks };
}

export function deriveDraftSelectionState(params: {
  editorMap: DraftEditorMap;
  selectionFrom: number;
  fallbackSection: DraftSectionId;
}): DraftSelectionState {
  const { editorMap, selectionFrom, fallbackSection } = params;
  let activeSection = fallbackSection;

  for (const section of Object.values(editorMap.sections)) {
    if (selectionFrom >= section.from && selectionFrom <= section.to) {
      activeSection = section.sectionId;
      break;
    }
  }

  const section = editorMap.sections[activeSection];
  let activeBlockId: string | null = null;

  if (section) {
    for (const blockId of section.blockIds) {
      const block = editorMap.blocks[blockId];
      if (!block) continue;
      if (selectionFrom >= block.from && selectionFrom <= block.to) {
        activeBlockId = blockId;
        break;
      }
      if (!activeBlockId && selectionFrom > block.to) {
        activeBlockId = blockId;
      }
    }
    if (!activeBlockId && section.blockIds.length > 0) {
      activeBlockId = section.blockIds[0] ?? null;
    }
  }

  return {
    activeSection,
    activeBlockId,
  };
}

export function getSectionFocusPosition(editorMap: DraftEditorMap, sectionId: DraftSectionId): number | null {
  return editorMap.sections[sectionId]?.focusPos ?? null;
}

export function getHeadingFocusPosition(
  editorMap: DraftEditorMap,
  sectionId: DraftSectionId,
  headingId: string,
): number | null {
  return editorMap.sections[sectionId]?.headingPositions[headingId] ?? null;
}

export function getBlockFocusPosition(editorMap: DraftEditorMap, blockId: string): number | null {
  return editorMap.blocks[blockId]?.focusPos ?? null;
}

export function getSelectedBlockEntry(editorMap: DraftEditorMap, blockId: string | null): DraftEditorBlockEntry | null {
  if (!blockId) return null;
  return editorMap.blocks[blockId] ?? null;
}
