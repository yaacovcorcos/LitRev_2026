import type { Study } from "@/types/ledger";
import { appendImportSummary, createImportSummary, entriesFromSummary } from "@/lib/draft-import/report";
import { parseBibliographyByFormat } from "@/lib/draft-import/bibliography";
import type {
  DraftAuxiliaryReference,
  DraftImportPayload,
  DraftImportResult,
} from "@/lib/draft-import/types";
import { parseLegacyDraftImport } from "@/lib/draft-import/legacy-draft";
import { parseManuscriptByFormat } from "@/lib/draft-import/manuscript";

export type DraftImportContext = {
  sourceLabel: string;
  studies: Study[];
  auxiliaryBibliography: DraftAuxiliaryReference[];
};

function blockCountFromSections(sections: DraftImportResult["sections"]): number {
  return sections.reduce((count, section) => count + section.blocks.length, 0);
}

export async function parseDraftImportPayload(
  payload: DraftImportPayload,
  context: DraftImportContext,
): Promise<DraftImportResult> {
  const sourceLabel = payload.filename?.trim() || context.sourceLabel;

  if (payload.format === "legacy-draft") {
    if (typeof payload.text !== "string") {
      throw new Error("Legacy draft import requires text input.");
    }
    return parseLegacyDraftImport(sourceLabel, JSON.parse(payload.text));
  }

  if (payload.format === "csl-json" || payload.format === "ris" || payload.format === "bibtex") {
    if (typeof payload.text !== "string") {
      throw new Error(`${payload.format} import requires text input.`);
    }
    const bibliography = parseBibliographyByFormat(payload.format, payload.text, context.studies);
    const summary = createImportSummary({
      preserved: payload.format === "csl-json"
        ? ["title", "author", "issued date", "DOI"]
        : ["title", "author", "year", "journal"],
    });

    return {
      format: payload.format,
      kind: "bibliography",
      sourceLabel,
      sections: [],
      bibliography,
      summary,
      report: entriesFromSummary(summary, payload.format, sourceLabel),
      stats: {
        sectionCount: 0,
        blockCount: 0,
        bibliographyCount: bibliography.length,
      },
    };
  }

  const manuscript = await parseManuscriptByFormat(
    payload.format,
    { text: payload.text, bytes: payload.bytes },
    {
      sourceFormat: payload.format,
      sourceLabel,
      auxiliaryBibliography: context.auxiliaryBibliography,
    },
  );

  const summary = appendImportSummary(createImportSummary(), manuscript.summary);
  return {
    format: payload.format,
    kind: "manuscript",
    sourceLabel,
    title: manuscript.title,
    sections: manuscript.sections,
    bibliography: [],
    summary,
    report: [...entriesFromSummary(summary, payload.format, sourceLabel), ...manuscript.report],
    stats: {
      sectionCount: manuscript.sections.length,
      blockCount: blockCountFromSections(manuscript.sections),
      bibliographyCount: 0,
    },
  };
}
