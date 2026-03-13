import type { JSONContent } from "@tiptap/core";
import type { DraftSectionId } from "@/types/draft";

export const MANUSCRIPT_SCHEMA_VERSION = 1 as const;
export const MANUSCRIPT_SECTION_NODE_TYPE = "manuscriptSection" as const;
export const BLOCK_ID_ATTR = "blockId" as const;
export const SECTION_NODE_ID_ATTR = "sectionNodeId" as const;

export type ManuscriptSectionKind = "base" | "custom";

export type ManuscriptSectionNodeAttrs = {
  sectionId: DraftSectionId;
  sectionNodeId: string;
  kind: ManuscriptSectionKind;
  label: string;
  placeholder?: string;
};

export type ManuscriptSectionMeta = ManuscriptSectionNodeAttrs;

export type ManuscriptDocument = {
  schemaVersion: typeof MANUSCRIPT_SCHEMA_VERSION;
  doc: JSONContent;
  sections: ManuscriptSectionMeta[];
};

export type ManuscriptAnchor = {
  sectionId: DraftSectionId;
  sectionNodeId: string;
  blockId: string;
  from?: number;
  to?: number;
  quote?: string;
};

export type ManuscriptOutlineHeading = {
  id: string;
  sectionId: DraftSectionId;
  blockId?: string;
  label: string;
  level: number;
};

export type ManuscriptOutlineEntry = ManuscriptSectionMeta & {
  isGenerated: boolean;
  headings: ManuscriptOutlineHeading[];
};

export type ManuscriptSectionTransform =
  | {
      type: "insert";
      section: ManuscriptSectionMeta;
      afterSectionId?: DraftSectionId;
      content?: JSONContent;
    }
  | {
      type: "remove";
      sectionId: DraftSectionId;
    }
  | {
      type: "reorder";
      sectionId: DraftSectionId;
      targetSectionId: DraftSectionId;
      position: "before" | "after";
    };

export type ManuscriptBlockMove = {
  sectionId: DraftSectionId;
  blockId: string;
  direction: "up" | "down";
};
