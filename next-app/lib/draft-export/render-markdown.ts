import type { JSONContent } from "@tiptap/core";
import type { CompiledDraftExportDocument } from "./model";
import { formatExportDate } from "./model";

function inlineMarkdown(nodes: JSONContent[] | undefined): string {
  if (!Array.isArray(nodes)) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") {
        let text = node.text ?? "";
        for (const mark of node.marks ?? []) {
          if (mark.type === "bold") {
            text = `**${text}**`;
          } else if (mark.type === "italic") {
            text = `*${text}*`;
          } else if (mark.type === "underline") {
            text = `<u>${text}</u>`;
          }
        }
        return text;
      }
      if (node.type === "citation") {
        const number = typeof node.attrs?.number === "number" ? Math.floor(node.attrs.number) : null;
        return number ? `[${number}]` : "[?]";
      }
      if (node.type === "hardBreak") {
        return "\n";
      }
      return inlineMarkdown(node.content);
    })
    .join("");
}

function blockMarkdown(node: JSONContent): string[] {
  switch (node.type) {
    case "paragraph":
      return [inlineMarkdown(node.content)];
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      return [`${"#".repeat(Math.max(1, Math.min(level, 6)))} ${inlineMarkdown(node.content)}`];
    }
    case "bulletList":
      return (node.content ?? []).flatMap((child) => listItemMarkdown(child, "-"));
    case "orderedList":
      return (node.content ?? []).flatMap((child, index) => listItemMarkdown(child, `${index + 1}.`));
    case "blockquote":
      return blockChildrenMarkdown(node).map((line) => (line ? `> ${line}` : ">"));
    default:
      return blockChildrenMarkdown(node);
  }
}

function blockChildrenMarkdown(node: JSONContent): string[] {
  return (node.content ?? []).flatMap((child) => blockMarkdown(child));
}

function listItemMarkdown(node: JSONContent, prefix: string): string[] {
  const lines = blockChildrenMarkdown(node).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [`${prefix} `];
  }
  const [first, ...rest] = lines;
  return [`${prefix} ${first}`, ...rest.map((line) => `  ${line}`)];
}

function docToMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .flatMap((node) => blockMarkdown(node))
    .filter((line, index, array) => !(line === "" && array[index - 1] === ""))
    .join("\n\n")
    .trim();
}

export function renderMarkdownExport(document: CompiledDraftExportDocument): Buffer {
  const lines: string[] = [`# ${document.projectTitle}`, ""];
  lines.push(`*Draft exported on ${formatExportDate(document.exportedAt)}*`);
  lines.push("");

  if (document.warnings.length > 0) {
    lines.push(
      `> Export diagnostics: ${document.warnings.length} diagnostic${document.warnings.length === 1 ? "" : "s"} detected.`,
    );
    lines.push("");
  }

  for (const section of document.sections) {
    if (!section.isWholeDraft || document.sections.length > 1) {
      lines.push(`## ${section.label}`);
      lines.push("");
    }
    const content = docToMarkdown(section.doc);
    if (content) {
      lines.push(content);
      lines.push("");
    }
  }

  if (document.references.length > 0) {
    lines.push("## References");
    lines.push("");
    for (const entry of document.references) {
      lines.push(entry.text);
    }
    lines.push("");
  }

  return Buffer.from(`${lines.join("\n").trim()}\n`, "utf8");
}
