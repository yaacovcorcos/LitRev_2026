import type { SearchResult } from "@/types/search";
import type { Study } from "@/types/ledger";

export type DuplicateMatch = {
  result: SearchResult;
  matchedBy: "pmid" | "doi" | "s2PaperId";
  matchedValue: string;
  existingTitle: string;
};

export type DedupResult = {
  unique: SearchResult[];
  duplicates: DuplicateMatch[];
};

/**
 * Check search results against existing studies and partition into unique/duplicate.
 * Matches on PMID, DOI, or Semantic Scholar paper ID.
 */
export function findDuplicates(
  existingStudies: Study[],
  results: SearchResult[]
): DedupResult {
  // Build lookup maps: identifier → existing study title (for diagnostics)
  const pmidMap = new Map<string, string>();
  const doiMap = new Map<string, string>();
  const s2IdMap = new Map<string, string>();

  for (const study of existingStudies) {
    const details = study.details;
    if (details?.pmid) pmidMap.set(details.pmid, study.title);
    if (details?.doi) doiMap.set(details.doi.toLowerCase(), study.title);
    if (typeof details?.s2PaperId === "string") s2IdMap.set(details.s2PaperId, study.title);
  }

  const unique: SearchResult[] = [];
  const duplicates: DuplicateMatch[] = [];

  for (const result of results) {
    const pmidTitle = result.pmid ? pmidMap.get(result.pmid) : undefined;
    const doiTitle = result.doi ? doiMap.get(result.doi.toLowerCase()) : undefined;
    const s2Id = result.metadata?.s2PaperId;
    const s2Title = (typeof s2Id === "string") ? s2IdMap.get(s2Id) : undefined;

    if (pmidTitle) {
      duplicates.push({ result, matchedBy: "pmid", matchedValue: result.pmid!, existingTitle: pmidTitle });
    } else if (doiTitle) {
      duplicates.push({ result, matchedBy: "doi", matchedValue: result.doi!, existingTitle: doiTitle });
    } else if (s2Title) {
      duplicates.push({ result, matchedBy: "s2PaperId", matchedValue: s2Id as string, existingTitle: s2Title });
    } else {
      unique.push(result);
    }
  }

  return { unique, duplicates };
}
