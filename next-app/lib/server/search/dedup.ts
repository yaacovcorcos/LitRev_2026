import type { SearchResult } from "@/types/search";
import type { Study } from "@/types/ledger";

export type DedupResult = {
  unique: SearchResult[];
  duplicates: SearchResult[];
};

/**
 * Check search results against existing studies and partition into unique/duplicate.
 * Matches on PMID or DOI.
 */
export function findDuplicates(
  existingStudies: Study[],
  results: SearchResult[]
): DedupResult {
  const pmidSet = new Set<string>();
  const doiSet = new Set<string>();

  for (const study of existingStudies) {
    const details = study.details;
    if (details?.pmid) pmidSet.add(details.pmid);
    if (details?.doi) doiSet.add(details.doi.toLowerCase());
  }

  const unique: SearchResult[] = [];
  const duplicates: SearchResult[] = [];

  for (const result of results) {
    const hasPmidMatch = result.pmid && pmidSet.has(result.pmid);
    const hasDoiMatch = result.doi && doiSet.has(result.doi.toLowerCase());

    if (hasPmidMatch || hasDoiMatch) {
      duplicates.push(result);
    } else {
      unique.push(result);
    }
  }

  return { unique, duplicates };
}
