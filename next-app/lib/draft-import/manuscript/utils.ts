import type { JSONContent } from "@tiptap/core";
import { DRAFT_SECTIONS, UNSECTIONED_DRAFT_ID, type DraftSectionId } from "@/types/draft";
import type { DraftAuxiliaryReference, DraftImportReportEntry } from "@/lib/draft-import/types";
import { createImportReportEntry } from "@/lib/draft-import/report";

const SECTION_BY_NORMALIZED_LABEL = new Map(
  DRAFT_SECTIONS.map((section) => [section.label.trim().toLowerCase(), section.key]),
);

export type ManuscriptParseContext = {
  sourceFormat: "markdown" | "html" | "docx" | "csv" | "tsv";
  sourceLabel: string;
  auxiliaryBibliography: DraftAuxiliaryReference[];
};

export type ParsedManuscriptSection = {
  label: string;
  sectionId?: DraftSectionId;
  isCustom: boolean;
  blocks: JSONContent[];
  sourceHeadingLevel?: number;
};

export type ParsedManuscriptResult = {
  title?: string;
  sections: ParsedManuscriptSection[];
  summary: {
    preserved: string[];
    downgraded: string[];
    unresolved: string[];
  };
  report: DraftImportReportEntry[];
};

function textNode(text: string): JSONContent {
  return { type: "text", text };
}

function paragraphNode(...content: JSONContent[]): JSONContent {
  return {
    type: "paragraph",
    content: content.length > 0 ? content : undefined,
  };
}

function headingNode(level: number, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [textNode(text)],
  };
}

function listItemNode(text: string): JSONContent {
  return {
    type: "listItem",
    content: [paragraphNode(textNode(text))],
  };
}

export function bulletListNode(items: string[]): JSONContent {
  return {
    type: "bulletList",
    content: items.map((item) => listItemNode(item)),
  };
}

export function orderedListNode(items: string[]): JSONContent {
  return {
    type: "orderedList",
    content: items.map((item) => listItemNode(item)),
  };
}

export function normalizeSectionLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

function slugSectionId(label: string): DraftSectionId {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "imported-section";
}

export function resolveSectionId(label: string): { sectionId?: DraftSectionId; isCustom: boolean } {
  const normalized = normalizeSectionLabel(label).toLowerCase();
  const base = SECTION_BY_NORMALIZED_LABEL.get(normalized);
  if (base) {
    return { sectionId: base, isCustom: false };
  }
  return { sectionId: slugSectionId(label), isCustom: true };
}

export function createWholeDraftSection(blocks: JSONContent[]): ParsedManuscriptSection {
  return {
    label: "Whole draft",
    sectionId: UNSECTIONED_DRAFT_ID,
    isCustom: false,
    blocks,
  };
}

function buildCitationUid(studyId: string, citationKey: string): string {
  const safeKey = citationKey.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "citation";
  return `import-${studyId}-${safeKey}`;
}

export function parseInlineText(
  rawText: string,
  context: ManuscriptParseContext,
): { content: JSONContent[]; report: DraftImportReportEntry[] } {
  const report: DraftImportReportEntry[] = [];
  const content: JSONContent[] = [];

  const citationRegex = /\[@([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const auxiliaryByCitationKey = new Map(
    context.auxiliaryBibliography
      .filter((entry) => entry.citationKey)
      .map((entry) => [entry.citationKey as string, entry]),
  );

  while ((match = citationRegex.exec(rawText)) !== null) {
    const before = rawText.slice(lastIndex, match.index);
    if (before.length > 0) {
      content.push(textNode(before));
    }

    const rawKeys = match[1]
      .split(/[;,]/)
      .map((value) => value.replace(/^@/, "").trim())
      .filter((value) => value.length > 0);

    const unresolvedKeys: string[] = [];
    for (const key of rawKeys) {
      const reference = auxiliaryByCitationKey.get(key);
      if (reference?.linkedStudyId) {
        content.push({
          type: "citation",
          attrs: {
            studyId: reference.linkedStudyId,
            uid: buildCitationUid(reference.linkedStudyId, key),
          },
        });
        content.push(textNode(" "));
      } else {
        unresolvedKeys.push(key);
      }
    }

    if (unresolvedKeys.length > 0) {
      const unresolvedText = unresolvedKeys.map((key) => `[Unresolved citation: ${key}]`).join(" ");
      content.push(textNode(unresolvedText));
      for (const key of unresolvedKeys) {
        report.push(
          createImportReportEntry({
            code: "import.citation.unresolved_key",
            preservation: "unresolved",
            message: `Could not resolve citation key "${key}" to a linked study.`,
            sourceFormat: context.sourceFormat,
            sourceLabel: context.sourceLabel,
            citationKey: key,
          }),
        );
      }
    } else if (content.length > 0 && content[content.length - 1]?.type === "text" && content[content.length - 1]?.text === " ") {
      content.pop();
    }

    lastIndex = citationRegex.lastIndex;
  }

  const after = rawText.slice(lastIndex);
  if (after.length > 0) {
    content.push(textNode(after));
  }

  return { content: content.length > 0 ? content : [textNode(rawText)], report };
}

export function paragraphFromText(
  text: string,
  context: ManuscriptParseContext,
): { block: JSONContent; report: DraftImportReportEntry[] } {
  const parsed = parseInlineText(text, context);
  return {
    block: paragraphNode(...parsed.content),
    report: parsed.report,
  };
}

export function headingFromText(text: string, level: number, context: ManuscriptParseContext) {
  const parsed = parseInlineText(text, context);
  return {
    block: {
      ...headingNode(level, ""),
      content: parsed.content,
    } satisfies JSONContent,
    report: parsed.report,
  };
}

export function tableParagraphBlocks(rows: string[][]): JSONContent[] {
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  const blocks: JSONContent[] = [];
  blocks.push(paragraphNode(textNode(`Columns: ${header.join(" | ")}`)));
  body.forEach((row, index) => {
    blocks.push(paragraphNode(textNode(`Row ${index + 1}: ${row.join(" | ")}`)));
  });
  return blocks;
}

