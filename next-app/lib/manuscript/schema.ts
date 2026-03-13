import type { JSONContent } from "@tiptap/core";
import { DEFAULT_SECTION_ORDER, DRAFT_SECTIONS, type DraftSectionId } from "@/types/draft";
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

function sectionKind(sectionId: DraftSectionId, customSections: Record<DraftSectionId, CustomSectionMeta>): ManuscriptSectionKind {
  return sectionId in customSections ? "custom" : "base";
}

function sectionLabel(sectionId: DraftSectionId, customSections: Record<DraftSectionId, CustomSectionMeta>): string {
  return customSections[sectionId]?.label ?? SECTION_LABEL_BY_ID.get(sectionId) ?? sectionId;
}

function sectionPlaceholder(
  sectionId: DraftSectionId,
  customSections: Record<DraftSectionId, CustomSectionMeta>,
): string | undefined {
  return customSections[sectionId]?.placeholder ?? SECTION_PLACEHOLDER_BY_ID.get(sectionId);
}

export function createSectionNodeId(sectionId: DraftSectionId): string {
  return `sec:${sectionId}`;
}

export function createDefaultManuscriptDocument(): ManuscriptDocument {
  const contentBySection = Object.fromEntries(
    DEFAULT_SECTION_ORDER.map((sectionId) => [sectionId, emptyDoc()]),
  ) as Record<DraftSectionId, JSONContent>;

  return createManuscriptDocument({
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    customSections: {},
    contentBySection,
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
  const { sectionOrder, customSections, contentBySection } = params;
  const sections: ManuscriptSectionMeta[] = [];
  const sectionNodes: JSONContent[] = [];

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
  const compat: Record<DraftSectionId, JSONContent> = {};
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
  if (value.schemaVersion !== MANUSCRIPT_SCHEMA_VERSION) return null;
  if (!isObject(value.doc) || value.doc.type !== "doc" || !Array.isArray(value.sections)) return null;

  const sections: ManuscriptSectionMeta[] = [];
  for (const section of value.sections) {
    if (
      !isObject(section) ||
      typeof section.sectionId !== "string" ||
      typeof section.sectionNodeId !== "string" ||
      (section.kind !== "base" && section.kind !== "custom") ||
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
