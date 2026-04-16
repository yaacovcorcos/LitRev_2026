import type { ManuscriptParseContext, ParsedManuscriptResult } from "./utils";
import { parseDocxManuscript } from "./docx";
import { parseHtmlManuscript } from "./html";
import { parseMarkdownManuscript } from "./markdown";
import { parseDelimitedTable } from "./tabular";

export async function parseManuscriptByFormat(
  format: "markdown" | "html" | "docx" | "csv" | "tsv",
  payload: { text?: string; bytes?: Uint8Array },
  context: ManuscriptParseContext,
): Promise<ParsedManuscriptResult> {
  switch (format) {
    case "markdown":
      if (typeof payload.text !== "string") throw new Error("Markdown import requires text input.");
      return parseMarkdownManuscript(payload.text, { ...context, sourceFormat: "markdown" });
    case "html":
      if (typeof payload.text !== "string") throw new Error("HTML import requires text input.");
      return parseHtmlManuscript(payload.text, { ...context, sourceFormat: "html" });
    case "csv":
      if (typeof payload.text !== "string") throw new Error("CSV import requires text input.");
      return parseDelimitedTable(payload.text, "csv", { ...context, sourceFormat: "csv" });
    case "tsv":
      if (typeof payload.text !== "string") throw new Error("TSV import requires text input.");
      return parseDelimitedTable(payload.text, "tsv", { ...context, sourceFormat: "tsv" });
    case "docx":
      if (!(payload.bytes instanceof Uint8Array)) throw new Error("DOCX import requires bytes input.");
      return parseDocxManuscript(payload.bytes, { ...context, sourceFormat: "docx" });
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported manuscript format: ${String(exhaustive)}`);
    }
  }
}
