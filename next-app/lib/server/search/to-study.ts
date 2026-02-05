import type { SearchResult } from "@/types/search";
import type { StudyInput } from "@/lib/utils/normalize";
import type { StudyDetails } from "@/types/ledger";

/**
 * Convert a SearchResult to a StudyInput for upsert into the ledger.
 */
export function searchResultToStudyInput(result: SearchResult): StudyInput {
  const details: StudyDetails = {
    source: "pubmed",
  };

  if (result.abstract) details.abstract = result.abstract;
  if (result.doi) details.doi = result.doi;
  if (result.pmid) details.pmid = result.pmid;
  if (result.journal) details.journal = result.journal;
  if (result.volume) details.volume = result.volume;
  if (result.issue) details.issue = result.issue;
  if (result.pages) details.pages = result.pages;
  if (result.keywords?.length) details.keywords = result.keywords;

  return {
    title: result.title,
    authors: result.authors,
    year: result.year,
    status: "pending",
    quality: "-",
    details,
  };
}
