import type { JSONContent } from "@tiptap/core";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  type IParagraphOptions,
} from "docx";
import type { CompiledDraftExportDocument } from "./model";
import { formatExportDate } from "./model";

function textRunsFromInline(nodes: JSONContent[] | undefined): TextRun[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) => {
    if (node.type === "text") {
      const markTypes = new Set((node.marks ?? []).map((mark) => mark.type));
      return [
        new TextRun({
          text: node.text ?? "",
          bold: markTypes.has("bold"),
          italics: markTypes.has("italic"),
          underline: markTypes.has("underline") ? {} : undefined,
        }),
      ];
    }
    if (node.type === "citation") {
      const number = typeof node.attrs?.number === "number" ? Math.floor(node.attrs.number) : null;
      return [new TextRun({ text: number ? `[${number}]` : "[?]" })];
    }
    if (node.type === "hardBreak") {
      return [new TextRun({ break: 1 })];
    }
    return textRunsFromInline(node.content);
  });
}

function flattenNodeText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "citation") {
    const number = typeof node.attrs?.number === "number" ? Math.floor(node.attrs.number) : null;
    return number ? `[${number}]` : "[?]";
  }
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map((child) => flattenNodeText(child)).join("");
}

function headingLevel(level: number) {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    default:
      return HeadingLevel.HEADING_5;
  }
}

function paragraphWithChildren(options: IParagraphOptions): Paragraph {
  return new Paragraph(options);
}

function blockToParagraphs(node: JSONContent): Paragraph[] {
  switch (node.type) {
    case "paragraph":
      return [paragraphWithChildren({ children: textRunsFromInline(node.content) })];
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      return [
        paragraphWithChildren({
          heading: headingLevel(level),
          children: textRunsFromInline(node.content),
        }),
      ];
    }
    case "bulletList":
      return (node.content ?? []).flatMap((child) => listItemToParagraphs(child, "•"));
    case "orderedList":
      return (node.content ?? []).flatMap((child, index) => listItemToParagraphs(child, `${index + 1}.`));
    case "blockquote":
      return [
        paragraphWithChildren({
          indent: { left: 720 },
          children: [new TextRun({ text: flattenNodeText(node), italics: true })],
        }),
      ];
    default:
      return (node.content ?? []).flatMap((child) => blockToParagraphs(child));
  }
}

function listItemToParagraphs(node: JSONContent, prefix: string): Paragraph[] {
  const text = flattenNodeText(node).trim();
  if (!text) return [];
  return [
    paragraphWithChildren({
      children: [new TextRun({ text: `${prefix} ${text}` })],
    }),
  ];
}

function docToParagraphs(doc: JSONContent): Paragraph[] {
  return (doc.content ?? []).flatMap((node) => blockToParagraphs(node));
}

export async function renderDocxExport(document: CompiledDraftExportDocument): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: document.projectTitle })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Draft exported on ${formatExportDate(document.exportedAt)}`, italics: true })],
    }),
  ];

  if (document.warnings.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Export warnings: ${document.warnings.length} citation issue${document.warnings.length === 1 ? "" : "s"} detected.`,
            italics: true,
          }),
        ],
      }),
    );
  }

  for (const section of document.sections) {
    if (!section.isWholeDraft || document.sections.length > 1) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: section.label })],
        }),
      );
    }
    children.push(...docToParagraphs(section.doc));
  }

  if (document.references.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "References" })],
      }),
    );
    for (const reference of document.references) {
      children.push(new Paragraph({ children: [new TextRun({ text: reference.text })] }));
    }
  }

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
