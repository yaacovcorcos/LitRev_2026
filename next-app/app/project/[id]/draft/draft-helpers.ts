/**
 * Pure helpers, constants, and types for the Draft Studio page.
 * Extracted from page.tsx for maintainability.
 */
import { CSSProperties } from "react";
import { DRAFT_SECTIONS, DraftMode, DraftSectionId, DraftSectionKey, UNSECTIONED_DRAFT_ID } from "@/types/draft";
import { DraftSectionFormat } from "@/lib/draftStorage";
import type { JSONContent } from "@tiptap/core";
import type { Study } from "@/types/ledger";

export const EMPTY_IDS: string[] = [];

/**
 * Format authors string for citation display.
 * "John Smith, Jane Doe, Bob Johnson" → "Smith et al."
 * "John Smith, Jane Doe" → "Smith & Doe"
 * "John Smith" → "Smith"
 */
export const formatAuthorsShort = (authors: string): string => {
  if (!authors) return "Unknown";
  // Split by comma or "and"
  const parts = authors.split(/,|(?:\s+and\s+)/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "Unknown";
  // Extract last name from first author (assumes "First Last" format)
  const firstAuthor = parts[0];
  const nameParts = firstAuthor.split(/\s+/);
  const lastName = nameParts[nameParts.length - 1];
  if (parts.length === 1) return lastName;
  if (parts.length === 2) {
    const secondNameParts = parts[1].split(/\s+/);
    const secondLastName = secondNameParts[secondNameParts.length - 1];
    return `${lastName} & ${secondLastName}`;
  }
  return `${lastName} et al.`;
};

export const studyLabel = (study: Study) => `${formatAuthorsShort(study.authors)}, ${study.year}`;

export const isBaseSectionKey = (value: string | null): value is DraftSectionKey => {
  if (!value) return false;
  return DRAFT_SECTIONS.some((s) => s.key === value);
};

export const isDraftMode = (value: string | null): value is DraftMode => value === "section" || value === "full";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export type SectionMeta = {
  id: DraftSectionId;
  label: string;
  placeholder?: string;
  isCustom?: boolean;
  isWholeDraft?: boolean;
};

export const BASE_SECTION_META: SectionMeta[] = DRAFT_SECTIONS.map((section) => ({
  id: section.key,
  label: section.label,
  placeholder: section.placeholder,
  isCustom: false,
}));

export const BASE_SECTION_MAP = new Map<DraftSectionId, SectionMeta>(
  BASE_SECTION_META.map((section) => [section.id, section])
);

export const WHOLE_DRAFT_META: SectionMeta = {
  id: UNSECTIONED_DRAFT_ID,
  label: "Whole draft",
  placeholder: "Start writing...",
  isWholeDraft: true,
};

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

export const createCustomSectionId = (label: string) => {
  const slug = slugify(label);
  return `custom-${slug || "section"}-${Date.now().toString(36)}`;
};

export const customSectionPlaceholder = (label: string) => `Draft the ${label} section.`;

export const docHasContent = (doc: JSONContent | null | undefined): boolean => {
  if (!doc || typeof doc !== "object") return false;
  const stack: JSONContent[] = [doc];
  while (stack.length) {
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
};

export const FONT_FAMILY_OPTIONS = [
  { label: "Default (Manuscript)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Sans (Lexend)", value: "Lexend, sans-serif" },
  { label: "Sans (Arial)", value: "Arial, Helvetica, sans-serif" },
  { label: "Mono (Courier)", value: "'Courier New', Courier, monospace" },
];

export const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28, 30, 32, 36, 40, 48, 60, 72];
export const LINE_HEIGHT_OPTIONS = [0.8, 0.9, 0.95, 1.0, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.75, 1.85, 2, 2.5, 3];
export const PARAGRAPH_SPACING_OPTIONS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

export const formatToVars = (format: DraftSectionFormat): CSSProperties =>
  ({
    "--editor-font-size": `${format.fontSize}px`,
    "--editor-line-height": `${format.lineHeight}`,
    "--editor-paragraph-spacing": `${format.paragraphSpacing}px`,
    "--editor-font-family": format.fontFamily,
  }) as CSSProperties;

/**
 * Convert TipTap JSON to plain text/markdown.
 */
export const jsonToText = (doc: JSONContent | null | undefined): string => {
  if (!doc) return "";

  const extractText = (node: JSONContent): string => {
    if (node.type === "text") {
      let text = node.text || "";
      // Apply marks for markdown
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === "bold") text = `**${text}**`;
          if (mark.type === "italic") text = `*${text}*`;
        }
      }
      return text;
    }
    if (node.type === "citation") {
      const raw = node.attrs?.number;
      const number = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
      return number ? `[${number}]` : "[?]";
    }
    if (node.type === "hardBreak") {
      return "\n";
    }
    if (!node.content) return "";

    const children = node.content.map(extractText).join("");

    // Add formatting based on node type
    switch (node.type) {
      case "paragraph":
        return children + "\n\n";
      case "heading": {
        const level = node.attrs?.level || 1;
        return "#".repeat(level) + " " + children + "\n\n";
      }
      case "bulletList":
        return children;
      case "orderedList":
        return children;
      case "listItem":
        return "- " + children.trim() + "\n";
      case "blockquote":
        return "> " + children.split("\n").filter(Boolean).join("\n> ") + "\n\n";
      default:
        return children;
    }
  };

  return extractText(doc).trim();
};
