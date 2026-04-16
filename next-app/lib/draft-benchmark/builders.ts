import type { JSONContent } from "@tiptap/core";
import { createDefaultDraftState, emptyDoc, type DraftState } from "@/lib/draft-storage";
import { buildCompatContentBySection, createManuscriptDocument } from "@/lib/manuscript/schema";
import { UNSECTIONED_DRAFT_ID, type DraftMode, type DraftSectionId } from "@/types/draft";

export type DraftFixtureCustomSection = {
  label: string;
  placeholder?: string;
};

export type DraftFixtureSectionInput = {
  content: JSONContent;
  ledgerStudyIds?: string[];
};

export type DraftFixtureInput = {
  sectionOrder: DraftSectionId[];
  customSections?: Record<DraftSectionId, DraftFixtureCustomSection>;
  sections: Record<DraftSectionId, DraftFixtureSectionInput>;
  mode?: DraftMode;
  activeSection?: DraftSectionId | null;
  wholeDraftContent?: JSONContent;
};

function buildSectionRecord<T>(ids: DraftSectionId[], factory: (id: DraftSectionId) => T): Record<DraftSectionId, T> {
  const record: Record<DraftSectionId, T> = {};
  for (const id of ids) {
    record[id] = factory(id);
  }
  return record;
}

function uniqueSectionIds(ids: DraftSectionId[]): DraftSectionId[] {
  const seen = new Set<DraftSectionId>();
  const ordered: DraftSectionId[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

export function textNode(text: string): JSONContent {
  return { type: "text", text };
}

export function citationNode(studyId: string, uid: string): JSONContent {
  return {
    type: "citation",
    attrs: {
      studyId,
      uid,
    },
  };
}

export function paragraph(...content: JSONContent[]): JSONContent {
  return {
    type: "paragraph",
    content: content.length > 0 ? content : undefined,
  };
}

export function heading(level: number, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [textNode(text)],
  };
}

function listItem(text: string): JSONContent {
  return {
    type: "listItem",
    content: [paragraph(textNode(text))],
  };
}

export function bulletList(items: string[]): JSONContent {
  return {
    type: "bulletList",
    content: items.map((item) => listItem(item)),
  };
}

export function orderedList(items: string[]): JSONContent {
  return {
    type: "orderedList",
    content: items.map((item) => listItem(item)),
  };
}

export function figureBlock(figureId: string, caption: string, altText?: string): JSONContent {
  return {
    type: "figure",
    attrs: {
      figureId,
      altText: altText ?? caption,
    },
    content: [paragraph(textNode(caption))],
  };
}

export function tableBlock(tableId: string, caption: string, rows: string[][]): JSONContent {
  return {
    type: "table",
    attrs: { tableId },
    content: [
      paragraph(textNode(caption)),
      ...rows.map((row, index) =>
        paragraph(textNode(`${index === 0 ? "Columns" : `Row ${index}`}: ${row.join(" | ")}`)),
      ),
    ],
  };
}

export function equationBlock(equationId: string, latex: string, label: string): JSONContent {
  return {
    type: "equation",
    attrs: {
      equationId,
      latex,
    },
    content: [
      paragraph(textNode(label)),
      paragraph(textNode(latex)),
    ],
  };
}

export function doc(...blocks: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: blocks.length > 0 ? blocks : [{ type: "paragraph" }],
  };
}

export function repeatedEvidenceParagraphs(params: {
  count: number;
  prefix: string;
  studyIds: string[];
  uidPrefix: string;
}): JSONContent[] {
  const { count, prefix, studyIds, uidPrefix } = params;
  return Array.from({ length: count }, (_, index) => {
    const studyId = studyIds[index % studyIds.length] ?? studyIds[0] ?? "study-1";
    return paragraph(
      textNode(
        `${prefix} ${index + 1} synthesizes treatment effect size, risk-of-bias posture, outcome variance, and subgroup caveats for the benchmark corpus.`,
      ),
      textNode(" "),
      citationNode(studyId, `${uidPrefix}-${index + 1}`),
    );
  });
}

export function createDraftFixture(input: DraftFixtureInput): DraftState {
  const base = createDefaultDraftState();
  const customSections = input.customSections ?? {};
  const knownIds = uniqueSectionIds([
    UNSECTIONED_DRAFT_ID,
    ...input.sectionOrder,
    ...Object.keys(customSections),
    ...Object.keys(input.sections),
  ] as DraftSectionId[]);

  const contentBySection = buildSectionRecord(knownIds, (id) => {
    if (id === UNSECTIONED_DRAFT_ID) {
      return input.wholeDraftContent ?? emptyDoc();
    }
    return input.sections[id]?.content ?? emptyDoc();
  });

  const manuscript = createManuscriptDocument({
    sectionOrder: input.sectionOrder,
    customSections,
    contentBySection,
  });
  const compatContent = buildCompatContentBySection(manuscript);

  return {
    version: 2,
    mode: input.mode ?? "section",
    activeSection: input.activeSection ?? input.sectionOrder[0] ?? null,
    sectionOrder: [...input.sectionOrder],
    customSections,
    formattingBySection: buildSectionRecord(knownIds, () => ({
      ...base.formattingBySection[UNSECTIONED_DRAFT_ID],
    })),
    panels: structuredClone(base.panels),
    contentBySection: buildSectionRecord(knownIds, (id) => compatContent[id] ?? emptyDoc()),
    ledgerBySection: buildSectionRecord(knownIds, (id) => [...(input.sections[id]?.ledgerStudyIds ?? [])]),
    copilotBySection: buildSectionRecord(knownIds, () => []),
    manuscript,
  };
}
