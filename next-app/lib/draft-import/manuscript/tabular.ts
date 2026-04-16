import { createImportSummary } from "@/lib/draft-import/report";
import type { ManuscriptParseContext, ParsedManuscriptResult } from "./utils";

function parseDelimited(input: string, delimiter: "," | "\t"): string[][] {
  return input
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(delimiter).map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

export function parseDelimitedTable(
  input: string,
  format: "csv" | "tsv",
  context: ManuscriptParseContext,
): ParsedManuscriptResult {
  void context;
  const rows = parseDelimited(input, format === "csv" ? "," : "\t");
  const blocks = rows.map((row, index) => ({
    type: "paragraph",
    content: [{ type: "text", text: `${index === 0 ? "Columns" : `Row ${index}`}: ${row.join(" | ")}` }],
  }));

  return {
    sections: [
      {
        label: "Imported table",
        sectionId: "results",
        isCustom: false,
        blocks,
      },
    ],
    summary: createImportSummary({
      preserved: ["rows", "columns"],
    }),
    report: [],
  };
}
