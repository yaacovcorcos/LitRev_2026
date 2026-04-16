import type { Study } from "@/types/ledger";
import type { DraftAuxiliaryReference } from "@/lib/draft-import/types";
import {
  linkReferenceToStudy,
  normalizeAuthors,
  normalizeDoi,
  normalizePmid,
  normalizeYear,
  stableAuxiliaryReferenceId,
} from "./normalize";

type CslJsonEntry = Record<string, unknown>;

function getIssuedYear(entry: CslJsonEntry): number | undefined {
  const issued = entry.issued;
  if (!issued || typeof issued !== "object") return undefined;
  const dateParts = (issued as { ["date-parts"]?: unknown })["date-parts"];
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) return undefined;
  return normalizeYear(dateParts[0][0]);
}

export function parseCslJsonBibliography(input: string, studies: Study[]): DraftAuxiliaryReference[] {
  const parsed = JSON.parse(input) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Expected CSL JSON array.");
  }

  return parsed.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as CslJsonEntry;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) return [];

    const reference: DraftAuxiliaryReference = {
      id: stableAuxiliaryReferenceId({
        sourceFormat: "csl-json",
        sourceItemId: typeof record.id === "string" ? record.id : `csl-${index + 1}`,
        citationKey: typeof record.id === "string" ? record.id : undefined,
        title,
        year: getIssuedYear(record),
        doi: normalizeDoi(record.DOI),
        pmid: normalizePmid(record.PMID),
      }),
      sourceFormat: "csl-json",
      sourceItemId: typeof record.id === "string" ? record.id : `csl-${index + 1}`,
      citationKey: typeof record.id === "string" ? record.id : undefined,
      title,
      authors: normalizeAuthors(record.author),
      year: getIssuedYear(record),
      containerTitle: typeof record["container-title"] === "string" ? record["container-title"].trim() : undefined,
      volume: typeof record.volume === "string" ? record.volume.trim() : undefined,
      issue: typeof record.issue === "string" ? record.issue.trim() : undefined,
      pages: typeof record.page === "string" ? record.page.trim() : undefined,
      doi: normalizeDoi(record.DOI),
      pmid: normalizePmid(record.PMID),
    };
    return [
      {
        ...reference,
        linkedStudyId: linkReferenceToStudy(reference, studies),
      },
    ];
  });
}
