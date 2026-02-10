import type { SearchResult } from "@/types/search";
import type { Study } from "@/types/ledger";

export type DedupResult = {
  unique: SearchResult[];
  duplicates: SearchResult[];
};

/**
 * Check search results against existing studies and partition into unique/duplicate.
 * Matches on PMID, DOI, or Semantic Scholar paper ID.
 */
export function findDuplicates(
  existingStudies: Study[],
  results: SearchResult[]
): DedupResult {
  const pmidSet = new Set<string>();
  const doiSet = new Set<string>();
  const s2IdSet = new Set<string>();

  for (const study of existingStudies) {
    const details = study.details;
    if (details?.pmid) pmidSet.add(details.pmid);
    if (details?.doi) doiSet.add(details.doi.toLowerCase());
    if (typeof details?.s2PaperId === "string") s2IdSet.add(details.s2PaperId);
  }

  const unique: SearchResult[] = [];
  const duplicates: SearchResult[] = [];

  for (const result of results) {
    const hasPmidMatch = result.pmid && pmidSet.has(result.pmid);
    const hasDoiMatch = result.doi && doiSet.has(result.doi.toLowerCase());
    const hasS2Match = result.metadata?.s2PaperId
      && typeof result.metadata.s2PaperId === "string"
      && s2IdSet.has(result.metadata.s2PaperId);

    if (hasPmidMatch || hasDoiMatch || hasS2Match) {
      duplicates.push(result);
    } else {
      unique.push(result);
    }
  }

  return { unique, duplicates };
}
