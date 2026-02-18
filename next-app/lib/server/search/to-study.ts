import type { SearchResult } from "@/types/search";
import type { StudyInput } from "@/lib/utils/normalize";
import type { StudyDetails, StudySource } from "@/types/ledger";

/** Map SearchResult.source to the StudySource enum used in the ledger. */
function resolveStudySource(resultSource: string): StudySource {
  switch (resultSource) {
    case "pubmed": return "pubmed";
    case "semantic-scholar": return "semantic-scholar";
    default: return "copilot";
  }
}

/** Only these metadata keys are copied into StudyDetails — prevents collisions with reserved fields */
const ALLOWED_METADATA_KEYS = ["s2PaperId", "citationCount", "influentialCitationCount", "isOpenAccess"];

/**
 * Convert a SearchResult to a StudyInput for upsert into the ledger.
 */
export function searchResultToStudyInput(result: SearchResult): StudyInput {
  const details: StudyDetails = {
    source: resolveStudySource(result.source),
  };

  if (result.abstract) details.abstract = result.abstract;
  if (result.doi) details.doi = result.doi;
  if (result.pmid) details.pmid = result.pmid;
  if (result.journal) details.journal = result.journal;
  if (result.volume) details.volume = result.volume;
  if (result.issue) details.issue = result.issue;
  if (result.pages) details.pages = result.pages;
  if (result.sourceUrl) details.sourceUrl = result.sourceUrl;
  if (result.keywords?.length) details.keywords = result.keywords;

  // Copy whitelisted metadata keys into details
  if (result.metadata) {
    for (const key of ALLOWED_METADATA_KEYS) {
      const value = result.metadata[key];
      if (value !== undefined && value !== null) {
        details[key] = value;
      }
    }
  }

  return {
    title: result.title,
    authors: result.authors,
    year: result.year,
    status: "pending",
    quality: "-",
    details,
  };
}
