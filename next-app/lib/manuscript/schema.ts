import type { JSONContent } from "@tiptap/core";
import { DRAFT_SECTIONS, type DraftSectionId, UNSECTIONED_DRAFT_ID } from "@/types/draft";
import {
  BLOCK_ID_ATTR,
  MANUSCRIPT_SCHEMA_VERSION,
  MANUSCRIPT_SECTION_NODE_TYPE,
  type ManuscriptDocument,
  type ManuscriptSectionKind,
  type ManuscriptSectionMeta,
  type ManuscriptSectionNodeAttrs,
} from "@/types/manuscript";
import { rewriteCitationStudyIdsInDoc } from "@/lib/citation-compiler";

type CustomSectionMeta = { label: string; placeholder?: string };

type CreateManuscriptParams = {
  sectionOrder: DraftSectionId[];
  customSections: Record<DraftSectionId, CustomSectionMeta>;
  contentBySection: Record<DraftSectionId, JSONContent>;
};

const REFERENCES_SECTION_ID = "references";
const WHOLE_DRAFT_LABEL = "Whole draft";
const WHOLE_DRAFT_PLACEHOLDER = "Start writing...";

const SECTION_LABEL_BY_ID = new Map<DraftSectionId, string>(DRAFT_SECTIONS.map((section) => [section.key, section.label]));
const SECTION_PLACEHOLDER_BY_ID = new Map<DraftSectionId, string | undefined>(
  DRAFT_SECTIONS.map((section) => [section.key, section.placeholder]),
);
const NON_ADDRESSABLE_NODE_TYPES = new Set(["doc", "text", "citation"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function emptyDoc(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

function asDoc(content: JSONContent | undefined): JSONContent {
  if (!content || !isObject(content) || content.type !== "doc") {
    return emptyDoc();
  }
  return content;
}

function docHasContent(content: JSONContent | undefined): boolean {
  const doc = asDoc(content);
  const stack = Array.isArray(doc.content) ? [...doc.content] : [];
  while (stack.length) {
    const node = stack.pop();
    if (!node || !isObject(node)) continue;
    if (node.type === "text" && typeof node.text === "string" && node.text.trim().length > 0) {
      return true;
    }
    if (node.type === "citation" || node.type === "hardBreak") {
      return true;
    }
    if (Array.isArray(node.content)) {
      stack.push(...node.content);
    }
  }
  return false;
}

function sectionKind(sectionId: DraftSectionId, customSections: Record<DraftSectionId, CustomSectionMeta>): ManuscriptSectionKind {
  if (sectionId === UNSECTIONED_DRAFT_ID) return "freeform";
  return sectionId in customSections ? "custom" : "base";
}

function sectionLabel(sectionId: DraftSectionId, customSections: Record<DraftSectionId, CustomSectionMeta>): string {
  if (sectionId === UNSECTIONED_DRAFT_ID) return WHOLE_DRAFT_LABEL;
  return customSections[sectionId]?.label ?? SECTION_LABEL_BY_ID.get(sectionId) ?? sectionId;
}

function sectionPlaceholder(
  sectionId: DraftSectionId,
  customSections: Record<DraftSectionId, CustomSectionMeta>,
): string | undefined {
  if (sectionId === UNSECTIONED_DRAFT_ID) return WHOLE_DRAFT_PLACEHOLDER;
  return customSections[sectionId]?.placeholder ?? SECTION_PLACEHOLDER_BY_ID.get(sectionId);
}

function shouldIncludeUnsectioned(contentBySection: Record<DraftSectionId, JSONContent>, sectionOrder: DraftSectionId[]): boolean {
  return docHasContent(contentBySection[UNSECTIONED_DRAFT_ID]) || sectionOrder.length === 0;
}

function normalizeNamedSectionOrder(sectionOrder: DraftSectionId[], contentBySection: Record<DraftSectionId, JSONContent>): DraftSectionId[] {
  const named = sectionOrder.filter((sectionId) => sectionId !== UNSECTIONED_DRAFT_ID);
  if (docHasContent(contentBySection[REFERENCES_SECTION_ID]) && !named.includes(REFERENCES_SECTION_ID)) {
    return [...named, REFERENCES_SECTION_ID];
  }
  return named;
}

export function createSectionNodeId(sectionId: DraftSectionId): string {
  if (sectionId === UNSECTIONED_DRAFT_ID) {
    return "sec:whole-draft";
  }
  return `sec:${sectionId}`;
}

export function createDefaultManuscriptDocument(): ManuscriptDocument {
  return createManuscriptDocument({
    sectionOrder: [],
    customSections: {},
    contentBySection: {
      [UNSECTIONED_DRAFT_ID]: emptyDoc(),
    },
  });
}

function createBlockId(sectionId: DraftSectionId, path: number[]): string {
  return `blk:${sectionId}:${path.join(".")}`;
}

function ensureNodeBlockIds(node: JSONContent, sectionId: DraftSectionId, path: number[]): JSONContent {
  if (!isObject(node)) return node;

  const nextNode: JSONContent = { ...node };
  if (typeof node.type === "string" && !NON_ADDRESSABLE_NODE_TYPES.has(node.type)) {
    const attrs = isObject(node.attrs) ? { ...node.attrs } : {};
    if (typeof attrs[BLOCK_ID_ATTR] !== "string" || String(attrs[BLOCK_ID_ATTR]).trim().length === 0) {
      attrs[BLOCK_ID_ATTR] = createBlockId(sectionId, path);
    }
    nextNode.attrs = attrs;
  }

  if (Array.isArray(node.content)) {
    nextNode.content = node.content.map((child, index) =>
      ensureNodeBlockIds(child, sectionId, [...path, index]),
    );
  }

  return nextNode;
}

export function ensureBlockIds(content: JSONContent, sectionId: DraftSectionId): JSONContent {
  const doc = asDoc(content);
  return {
    ...doc,
    content: Array.isArray(doc.content)
      ? doc.content.map((child, index) => ensureNodeBlockIds(child, sectionId, [index]))
      : [],
  };
}

function createSectionNode(
  sectionId: DraftSectionId,
  customSections: Record<DraftSectionId, CustomSectionMeta>,
  content: JSONContent,
): JSONContent {
  const ensured = ensureBlockIds(content, sectionId);
  const attrs: ManuscriptSectionNodeAttrs = {
    sectionId,
    sectionNodeId: createSectionNodeId(sectionId),
    kind: sectionKind(sectionId, customSections),
    label: sectionLabel(sectionId, customSections),
  };
  const placeholder = sectionPlaceholder(sectionId, customSections);
  if (placeholder) {
    attrs.placeholder = placeholder;
  }
  return {
    type: MANUSCRIPT_SECTION_NODE_TYPE,
    attrs,
    content: ensured.content ?? [],
  };
}

export function createManuscriptDocument(params: CreateManuscriptParams): ManuscriptDocument {
  const { customSections, contentBySection } = params;
  const sectionOrder = normalizeNamedSectionOrder(params.sectionOrder, contentBySection);
  const sections: ManuscriptSectionMeta[] = [];
  const sectionNodes: JSONContent[] = [];

  if (shouldIncludeUnsectioned(contentBySection, sectionOrder)) {
    const unsectionedMeta: ManuscriptSectionMeta = {
      sectionId: UNSECTIONED_DRAFT_ID,
      sectionNodeId: createSectionNodeId(UNSECTIONED_DRAFT_ID),
      kind: "freeform",
      label: WHOLE_DRAFT_LABEL,
      placeholder: WHOLE_DRAFT_PLACEHOLDER,
    };
    sections.push(unsectionedMeta);
    sectionNodes.push(createSectionNode(UNSECTIONED_DRAFT_ID, customSections, contentBySection[UNSECTIONED_DRAFT_ID]));
  }

  for (const sectionId of sectionOrder) {
    const attrs: ManuscriptSectionMeta = {
      sectionId,
      sectionNodeId: createSectionNodeId(sectionId),
      kind: sectionKind(sectionId, customSections),
      label: sectionLabel(sectionId, customSections),
    };
    const placeholder = sectionPlaceholder(sectionId, customSections);
    if (placeholder) {
      attrs.placeholder = placeholder;
    }
    sections.push(attrs);
    sectionNodes.push(createSectionNode(sectionId, customSections, contentBySection[sectionId]));
  }

  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    doc: {
      type: "doc",
      content: sectionNodes,
    },
    sections,
  };
}

export function buildCompatContentBySection(document: ManuscriptDocument): Record<DraftSectionId, JSONContent> {
  const compat: Record<DraftSectionId, JSONContent> = {
    [UNSECTIONED_DRAFT_ID]: emptyDoc(),
  };
  const content = Array.isArray(document.doc.content) ? document.doc.content : [];

  for (const sectionMeta of document.sections) {
    compat[sectionMeta.sectionId] = emptyDoc();
  }

  for (const node of content) {
    if (!isObject(node) || node.type !== MANUSCRIPT_SECTION_NODE_TYPE) continue;
    const attrs = isObject(node.attrs) ? node.attrs : {};
    const sectionId = typeof attrs.sectionId === "string" ? (attrs.sectionId as DraftSectionId) : null;
    if (!sectionId) continue;
    compat[sectionId] = {
      type: "doc",
      content: Array.isArray(node.content) ? node.content : [{ type: "paragraph" }],
    };
  }

  return compat;
}

export function coerceManuscriptDocument(value: unknown): ManuscriptDocument | null {
  if (!isObject(value)) return null;
  if ((value.schemaVersion !== 1 && value.schemaVersion !== MANUSCRIPT_SCHEMA_VERSION) || !isObject(value.doc) || value.doc.type !== "doc" || !Array.isArray(value.sections)) {
    return null;
  }

  const sections: ManuscriptSectionMeta[] = [];
  for (const section of value.sections) {
    if (
      !isObject(section) ||
      typeof section.sectionId !== "string" ||
      typeof section.sectionNodeId !== "string" ||
      (section.kind !== "base" && section.kind !== "custom" && section.kind !== "freeform") ||
      typeof section.label !== "string"
    ) {
      return null;
    }
    sections.push({
      sectionId: section.sectionId as DraftSectionId,
      sectionNodeId: section.sectionNodeId,
      kind: section.kind,
      label: section.label,
      ...(typeof section.placeholder === "string" && section.placeholder.trim().length > 0
        ? { placeholder: section.placeholder }
        : {}),
    });
  }

  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    doc: value.doc as JSONContent,
    sections,
  };
}

export function rewriteCitationStudyIdsInManuscript(
  document: ManuscriptDocument,
  replacements: Record<string, string>,
): { document: ManuscriptDocument; changedCount: number } {
  const rewritten = rewriteCitationStudyIdsInDoc(document.doc, replacements);
  return {
    changedCount: rewritten.changedCount,
    document: {
      ...document,
      doc: rewritten.content,
    },
  };
}
