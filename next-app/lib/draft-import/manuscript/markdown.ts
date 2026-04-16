import type { JSONContent } from "@tiptap/core";
import { appendImportSummary, createImportSummary } from "@/lib/draft-import/report";
import type { DraftImportReportEntry } from "@/lib/draft-import/types";
import {
  bulletListNode,
  createWholeDraftSection,
  headingFromText,
  orderedListNode,
  paragraphFromText,
  resolveSectionId,
  type ManuscriptParseContext,
  type ParsedManuscriptResult,
  type ParsedManuscriptSection,
} from "./utils";

function isOrderedListLine(line: string): boolean {
  return /^\d+\.\s+/.test(line);
}

function isBulletListLine(line: string): boolean {
  return /^[-*+]\s+/.test(line);
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  return current.includes("|") && /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/.test(next);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseMarkdownManuscript(input: string, context: ManuscriptParseContext): ParsedManuscriptResult {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const sections: ParsedManuscriptSection[] = [];
  const report: DraftImportReportEntry[] = [];
  let summary = createImportSummary({
    preserved: ["headings", "paragraphs", "lists"],
  });

  let title: string | undefined;
  let currentSection: ParsedManuscriptSection | null = null;
  const ensureSection = () => {
    if (!currentSection) {
      currentSection = createWholeDraftSection([]);
    }
    return currentSection;
  };

  const flushSection = () => {
    if (currentSection && currentSection.blocks.length > 0) {
      sections.push(currentSection);
    }
    currentSection = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      if (!title && level === 1) {
        title = headingText;
        continue;
      }

      if (level <= 2) {
        flushSection();
        const resolved = resolveSectionId(headingText);
        currentSection = {
          label: headingText,
          sectionId: resolved.sectionId,
          isCustom: resolved.isCustom,
          blocks: [],
          sourceHeadingLevel: level,
        };
        continue;
      }

      const heading = headingFromText(headingText, level, context);
      ensureSection().blocks.push(heading.block);
      report.push(...heading.report);
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const rows = [splitTableRow(lines[index] ?? "")];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      index -= 1;
      ensureSection().blocks.push(...rows.map((row, rowIndex) => {
        const label = rowIndex === 0 ? "Columns" : `Row ${rowIndex}`;
        return {
          type: "paragraph",
          content: [{ type: "text", text: `${label}: ${row.join(" | ")}` }],
        } satisfies JSONContent;
      }));
      summary = appendImportSummary(summary, {
        preserved: ["table structure"],
        downgraded: ["table formatting"],
      });
      continue;
    }

    if (isOrderedListLine(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && isOrderedListLine(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s+/, "").trim());
        index += 1;
      }
      index -= 1;
      ensureSection().blocks.push(orderedListNode(items));
      continue;
    }

    if (isBulletListLine(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && isBulletListLine(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^[-*+]\s+/, "").trim());
        index += 1;
      }
      index -= 1;
      ensureSection().blocks.push(bulletListNode(items));
      continue;
    }

    const paragraphLines = [trimmed];
    while (index + 1 < lines.length) {
      const next = (lines[index + 1] ?? "").trim();
      if (!next || /^(#{1,6})\s+/.test(next) || isOrderedListLine(next) || isBulletListLine(next) || isMarkdownTableStart(lines, index + 1)) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }

    const paragraph = paragraphFromText(paragraphLines.join(" "), context);
    ensureSection().blocks.push(paragraph.block);
    report.push(...paragraph.report);
  }

  flushSection();

  if (report.some((entry) => entry.code === "import.citation.unresolved_key")) {
    summary = appendImportSummary(summary, {
      downgraded: ["citation syntax to unresolved external references"],
      unresolved: ["pandoc-style cite keys"],
    });
  }

  return {
    title,
    sections,
    summary,
    report,
  };
}
