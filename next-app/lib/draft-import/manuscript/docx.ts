import mammoth from "mammoth";
import { createImportReportEntry } from "@/lib/draft-import/report";
import type { DraftImportReportEntry } from "@/lib/draft-import/types";
import type { ManuscriptParseContext, ParsedManuscriptResult } from "./utils";
import { parseHtmlManuscript } from "./html";

export async function parseDocxManuscript(
  input: Uint8Array,
  context: ManuscriptParseContext,
): Promise<ParsedManuscriptResult> {
  const converted = await mammoth.convertToHtml({ buffer: Buffer.from(input) });
  const parsed = parseHtmlManuscript(converted.value, {
    ...context,
    sourceFormat: "docx",
  });

  const report: DraftImportReportEntry[] = [...parsed.report];
  for (const message of converted.messages) {
    report.push(
      createImportReportEntry({
        code: `import.docx.${message.type}`,
        preservation: message.type === "warning" ? "downgraded" : "unresolved",
        message: message.message,
        sourceFormat: "docx",
        sourceLabel: context.sourceLabel,
      }),
    );
  }

  return {
    ...parsed,
    summary: {
      preserved: Array.from(new Set([...parsed.summary.preserved, "headings", "paragraphs", "lists"])),
      downgraded: Array.from(new Set([...parsed.summary.downgraded, "table styling"])),
      unresolved: Array.from(new Set([...parsed.summary.unresolved, "embedded citation field codes"])),
    },
    report,
  };
}
