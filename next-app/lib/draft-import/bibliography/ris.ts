import Cite from "citation-js";
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

type ParsedCitationEntry = Record<string, unknown>;

function coerceParsedEntries(input: string): ParsedCitationEntry[] {
  const cite = new Cite(input) as Cite & { data?: unknown };
  return Array.isArray(cite.data) ? (cite.data as ParsedCitationEntry[]) : [];
}

export function parseRisBibliography(input: string, studies: Study[]): DraftAuxiliaryReference[] {
  return coerceParsedEntries(input).flatMap((entry, index) => {
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title) return [];

    const reference: DraftAuxiliaryReference = {
      id: stableAuxiliaryReferenceId({
        sourceFormat: "ris",
        sourceItemId: typeof entry.id === "string" ? entry.id : `ris-${index + 1}`,
        citationKey: typeof entry.id === "string" ? entry.id : undefined,
        title,
        year: normalizeYear(entry.issued),
        doi: normalizeDoi(entry.DOI),
        pmid: normalizePmid(entry.PMID),
      }),
      sourceFormat: "ris",
      sourceItemId: typeof entry.id === "string" ? entry.id : `ris-${index + 1}`,
      citationKey: typeof entry.id === "string" ? entry.id : undefined,
      title,
      authors: normalizeAuthors(entry.author),
      year: normalizeYear(entry.issued),
      containerTitle: typeof entry["container-title"] === "string" ? entry["container-title"].trim() : undefined,
      volume: typeof entry.volume === "string" ? entry.volume.trim() : undefined,
      issue: typeof entry.issue === "string" ? entry.issue.trim() : undefined,
      pages: typeof entry.page === "string" ? entry.page.trim() : undefined,
      doi: normalizeDoi(entry.DOI),
      pmid: normalizePmid(entry.PMID),
    };
    return [{ ...reference, linkedStudyId: linkReferenceToStudy(reference, studies) }];
  });
}
