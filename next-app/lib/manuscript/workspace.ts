import type { JSONContent } from "@tiptap/core";
import type { DraftSectionId } from "@/types/draft";
import {
  BLOCK_ID_ATTR,
  MANUSCRIPT_SECTION_NODE_TYPE,
  type ManuscriptBlockMove,
  type ManuscriptDocument,
  type ManuscriptOutlineEntry,
  type ManuscriptOutlineHeading,
  type ManuscriptSectionMeta,
} from "@/types/manuscript";
import { createSectionNodeId, ensureBlockIds } from "@/lib/manuscript/schema";

const REFERENCES_SECTION_ID = "references";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function emptyDoc(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

function getNodeBlockId(node: JSONContent): string | null {
  if (!isObject(node.attrs)) return null;
  const blockId = node.attrs[BLOCK_ID_ATTR];
  return typeof blockId === "string" && blockId.trim().length > 0 ? blockId : null;
}

function textFromNode(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") {
    return typeof node.text === "string" ? node.text : "";
  }
  if (node.type === "citation") {
    return "[citation]";
  }
  if (!Array.isArray(node.content)) return "";
  return node.content.map((child) => textFromNode(child)).join(" ").replace(/\s+/g, " ").trim();
}

function cloneContent(content: JSONContent | undefined): JSONContent {
  if (!content || !Array.isArray(content.content)) {
    return emptyDoc();
  }
  return {
    type: "doc",
    content: content.content.map((node) => structuredClone(node)),
  };
}

function createSectionNode(section: ManuscriptSectionMeta, content?: JSONContent): JSONContent {
  const ensured = ensureBlockIds(cloneContent(content), section.sectionId);
  return {
    type: MANUSCRIPT_SECTION_NODE_TYPE,
    attrs: {
      sectionId: section.sectionId,
      sectionNodeId: section.sectionNodeId || createSectionNodeId(section.sectionId),
      kind: section.kind,
      label: section.label,
      ...(section.placeholder ? { placeholder: section.placeholder } : {}),
    },
    content: Array.isArray(ensured.content) ? ensured.content : [],
  };
}

function normalizeReferencesLast(document: ManuscriptDocument): ManuscriptDocument {
  const sectionPairs = document.sections.map((section, index) => ({
    section,
    node: Array.isArray(document.doc.content) ? document.doc.content[index] : undefined,
  }));
  const nonReferences = sectionPairs.filter((pair) => pair.section.sectionId !== REFERENCES_SECTION_ID);
  const references = sectionPairs.find((pair) => pair.section.sectionId === REFERENCES_SECTION_ID);
  const ordered = references ? [...nonReferences, references] : nonReferences;
  return {
    ...document,
    sections: ordered.map((pair) => pair.section),
    doc: {
      type: "doc",
      content: ordered.map((pair) => pair.node ?? createSectionNode(pair.section)),
    },
  };
}

function findSectionIndex(document: ManuscriptDocument, sectionId: DraftSectionId): number {
  return document.sections.findIndex((section) => section.sectionId === sectionId);
}

export function extractManuscriptOutline(document: ManuscriptDocument): ManuscriptOutlineEntry[] {
  const nodes = Array.isArray(document.doc.content) ? document.doc.content : [];
  return document.sections.map((section, index) => {
    const sectionNode = nodes[index];
    const headings: ManuscriptOutlineHeading[] = [];
    const sectionContent = Array.isArray(sectionNode?.content) ? sectionNode.content : [];

    sectionContent.forEach((node, nodeIndex) => {
      if (node.type !== "heading") return;
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      const label = textFromNode(node).trim();
      if (!label) return;
      const blockId = getNodeBlockId(node);
      headings.push({
        id: blockId ?? `heading:${section.sectionId}:${nodeIndex}`,
        sectionId: section.sectionId,
        blockId: blockId ?? undefined,
        label,
        level,
      });
    });

    return {
      ...section,
      isGenerated: section.sectionId === REFERENCES_SECTION_ID,
      headings,
    };
  });
}

export function insertManuscriptSection(params: {
  document: ManuscriptDocument;
  section: ManuscriptSectionMeta;
  afterSectionId?: DraftSectionId;
  content?: JSONContent;
}): ManuscriptDocument {
  const { document, section, afterSectionId, content } = params;
  if (findSectionIndex(document, section.sectionId) >= 0) {
    return normalizeReferencesLast(document);
  }

  const sections = [...document.sections];
  const nodes = Array.isArray(document.doc.content) ? [...document.doc.content] : [];
  const referenceIndex = sections.findIndex((entry) => entry.sectionId === REFERENCES_SECTION_ID);
  const afterIndex = afterSectionId ? sections.findIndex((entry) => entry.sectionId === afterSectionId) : sections.length - 1;
  let insertIndex = afterIndex >= 0 ? afterIndex + 1 : sections.length;
  if (section.sectionId !== REFERENCES_SECTION_ID && referenceIndex >= 0 && insertIndex > referenceIndex) {
    insertIndex = referenceIndex;
  }
  if (section.sectionId === REFERENCES_SECTION_ID) {
    insertIndex = sections.length;
  }

  sections.splice(insertIndex, 0, section);
  nodes.splice(insertIndex, 0, createSectionNode(section, content));

  return normalizeReferencesLast({
    ...document,
    sections,
    doc: { type: "doc", content: nodes },
  });
}

export function removeManuscriptSection(document: ManuscriptDocument, sectionId: DraftSectionId): ManuscriptDocument {
  if (sectionId === REFERENCES_SECTION_ID) {
    return document;
  }
  const index = findSectionIndex(document, sectionId);
  if (index < 0) return document;
  const sections = document.sections.filter((section) => section.sectionId !== sectionId);
  const nodes = (Array.isArray(document.doc.content) ? document.doc.content : []).filter((_, nodeIndex) => nodeIndex !== index);
  return normalizeReferencesLast({
    ...document,
    sections,
    doc: { type: "doc", content: nodes },
  });
}

export function reorderManuscriptSection(params: {
  document: ManuscriptDocument;
  sectionId: DraftSectionId;
  targetSectionId: DraftSectionId;
  position: "before" | "after";
}): ManuscriptDocument {
  const { document, sectionId, targetSectionId, position } = params;
  if (sectionId === REFERENCES_SECTION_ID || targetSectionId === REFERENCES_SECTION_ID) {
    return normalizeReferencesLast(document);
  }
  const sourceIndex = findSectionIndex(document, sectionId);
  const targetIndex = findSectionIndex(document, targetSectionId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return normalizeReferencesLast(document);
  }

  const sections = [...document.sections];
  const nodes = Array.isArray(document.doc.content) ? [...document.doc.content] : [];
  const [section] = sections.splice(sourceIndex, 1);
  const [node] = nodes.splice(sourceIndex, 1);
  const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertIndex = position === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  sections.splice(insertIndex, 0, section);
  nodes.splice(insertIndex, 0, node);

  return normalizeReferencesLast({
    ...document,
    sections,
    doc: { type: "doc", content: nodes },
  });
}

export function moveTopLevelBlock(document: ManuscriptDocument, move: ManuscriptBlockMove): ManuscriptDocument {
  if (move.sectionId === REFERENCES_SECTION_ID) {
    return document;
  }
  const sectionIndex = findSectionIndex(document, move.sectionId);
  if (sectionIndex < 0) return document;

  const nodes = Array.isArray(document.doc.content) ? [...document.doc.content] : [];
  const sectionNode = nodes[sectionIndex];
  if (!sectionNode || !Array.isArray(sectionNode.content)) return document;

  const blockIndex = sectionNode.content.findIndex((node) => getNodeBlockId(node) === move.blockId);
  if (blockIndex < 0) return document;

  const targetIndex = move.direction === "up" ? blockIndex - 1 : blockIndex + 1;
  if (targetIndex < 0 || targetIndex >= sectionNode.content.length) {
    return document;
  }

  const nextContent = [...sectionNode.content];
  const [block] = nextContent.splice(blockIndex, 1);
  nextContent.splice(targetIndex, 0, block);

  nodes[sectionIndex] = {
    ...sectionNode,
    content: nextContent,
  };

  return {
    ...document,
    doc: {
      type: "doc",
      content: nodes,
    },
  };
}
