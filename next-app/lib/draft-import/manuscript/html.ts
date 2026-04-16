import { HTMLElement, parse, type Node as HtmlNode } from "node-html-parser";
import { appendImportSummary, createImportReportEntry, createImportSummary } from "@/lib/draft-import/report";
import type { DraftImportReportEntry } from "@/lib/draft-import/types";
import {
  bulletListNode,
  createWholeDraftSection,
  orderedListNode,
  paragraphFromText,
  resolveSectionId,
  type ManuscriptParseContext,
  type ParsedManuscriptResult,
  type ParsedManuscriptSection,
} from "./utils";

function isElement(node: HtmlNode): node is HTMLElement {
  return node instanceof HTMLElement;
}

function normalizedText(node: HtmlNode): string {
  return node.textContent.replace(/\s+/g, " ").trim();
}

function tableRows(table: HTMLElement): string[][] {
  return table.querySelectorAll("tr").map((row) =>
    row.querySelectorAll("th,td").map((cell) => normalizedText(cell)),
  ).filter((row) => row.some((cell) => cell.length > 0));
}

export function parseHtmlManuscript(input: string, context: ManuscriptParseContext): ParsedManuscriptResult {
  const root = parse(input, { comment: false });
  const report: DraftImportReportEntry[] = [];
  let summary = createImportSummary({
    preserved: ["paragraphs"],
  });
  let title: string | undefined;
  const sections: ParsedManuscriptSection[] = [];
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

  const visit = (node: HtmlNode) => {
    if (!isElement(node)) return;
    const tag = node.tagName.toLowerCase();
    if (node.getAttribute("style")) {
      summary = appendImportSummary(summary, { downgraded: ["inline styles"] });
    }

    if (tag === "h1" && !title) {
      title = normalizedText(node);
      summary = appendImportSummary(summary, { preserved: ["headings"] });
      return;
    }

    if (tag === "h1" || tag === "h2") {
      flushSection();
      const label = normalizedText(node);
      const resolved = resolveSectionId(label);
      currentSection = {
        label,
        sectionId: resolved.sectionId,
        isCustom: resolved.isCustom,
        blocks: [],
        sourceHeadingLevel: tag === "h1" ? 1 : 2,
      };
      summary = appendImportSummary(summary, { preserved: ["headings"] });
      return;
    }

    if (tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
      const paragraph = paragraphFromText(normalizedText(node), context);
      ensureSection().blocks.push({
        type: "heading",
        attrs: { level: Number.parseInt(tag.slice(1), 10) },
        content: paragraph.block.content,
      });
      report.push(...paragraph.report);
      summary = appendImportSummary(summary, { preserved: ["headings"] });
      return;
    }

    if (tag === "p") {
      const paragraph = paragraphFromText(normalizedText(node), context);
      ensureSection().blocks.push(paragraph.block);
      report.push(...paragraph.report);
      return;
    }

    if (tag === "ul") {
      const items = node.querySelectorAll("li").map((item) => normalizedText(item)).filter(Boolean);
      if (items.length > 0) {
        ensureSection().blocks.push(bulletListNode(items));
        summary = appendImportSummary(summary, { preserved: ["lists"] });
      }
      return;
    }

    if (tag === "ol") {
      const items = node.querySelectorAll("li").map((item) => normalizedText(item)).filter(Boolean);
      if (items.length > 0) {
        ensureSection().blocks.push(orderedListNode(items));
        summary = appendImportSummary(summary, { preserved: ["lists"] });
      }
      return;
    }

    if (tag === "table") {
      const rows = tableRows(node);
      if (rows.length > 0) {
        const [header, ...body] = rows;
        ensureSection().blocks.push({
          type: "paragraph",
          content: [{ type: "text", text: `Columns: ${header.join(" | ")}` }],
        });
        body.forEach((row, rowIndex) => {
          ensureSection().blocks.push({
            type: "paragraph",
            content: [{ type: "text", text: `Row ${rowIndex + 1}: ${row.join(" | ")}` }],
          });
        });
        summary = appendImportSummary(summary, {
          preserved: ["table rows", "table columns"],
          downgraded: ["table border styling"],
        });
      }
      return;
    }

    if (tag === "br") {
      return;
    }

    if (tag === "span" || tag === "div" || tag === "section" || tag === "article" || tag === "body") {
      node.childNodes.forEach(visit);
      return;
    }

    if (normalizedText(node).length > 0) {
      report.push(
        createImportReportEntry({
          code: "import.html.dropped_unsupported_element",
          preservation: "downgraded",
          message: `Downgraded unsupported HTML element <${tag}> to plain text handling.`,
          sourceFormat: context.sourceFormat,
          sourceLabel: context.sourceLabel,
          objectType: tag,
        }),
      );
    }
    node.childNodes.forEach(visit);
  };

  root.childNodes.forEach(visit);
  flushSection();

  return {
    title,
    sections,
    summary,
    report,
  };
}
