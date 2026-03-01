import type { SearchResult } from "@/types/search";
import type { Study } from "@/types/ledger";

export type DuplicateMatch = {
  result: SearchResult;
  matchedBy: "pmid" | "doi" | "s2PaperId" | "titleYear";
  matchedValue: string;
  existingStudyId: string;
  existingTitle: string;
};

export type DedupResult = {
  unique: SearchResult[];
  duplicates: DuplicateMatch[];
};

type ExistingStudyRef = {
  id: string;
  title: string;
  authorToken?: string;
};

function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi\s*:\s*/i, "")
    .replace(/[),.;:\]]+$/g, "")
    .toLowerCase();
  if (!/^10\.\d{4,9}\/.+/.test(normalized)) return undefined;
  return normalized;
}

function normalizePmid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 9) return undefined;
  return digits;
}

function normalizeTitle(value: string | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toTitleYearKey(title: string | undefined, year: number | undefined): string | undefined {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle || !Number.isFinite(year)) return undefined;
  return `${normalizedTitle}|${year}`;
}

function firstAuthorToken(authors: string | undefined): string | undefined {
  if (!authors) return undefined;
  const primary = authors.split(/,|;| and /i)[0]?.trim();
  if (!primary) return undefined;
  const normalized = primary
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .trim();
  if (!normalized) return undefined;
  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1];
}

function isTitleYearAuthorMatch(existing: ExistingStudyRef, candidateAuthorToken: string | undefined): boolean {
  // Optional author token check:
  // - if both sides have a token, require match
  // - if either side is missing, allow title+year duplicate
  if (existing.authorToken && candidateAuthorToken) {
    return existing.authorToken === candidateAuthorToken;
  }
  return true;
}

/**
 * Check search results against existing studies and partition into unique/duplicate.
 * Matches on PMID, DOI, Semantic Scholar paper ID, and normalized title+year.
 */
export function findDuplicates(
  existingStudies: Study[],
  results: SearchResult[]
): DedupResult {
  // Build lookup maps: identifier/title-year → existing study reference (for diagnostics)
  const pmidMap = new Map<string, ExistingStudyRef>();
  const doiMap = new Map<string, ExistingStudyRef>();
  const s2IdMap = new Map<string, ExistingStudyRef>();
  const titleYearMap = new Map<string, ExistingStudyRef[]>();

  for (const study of existingStudies) {
    const details = study.details;
    const ref: ExistingStudyRef = {
      id: study.id,
      title: study.title,
      authorToken: firstAuthorToken(study.authors),
    };

    const pmid = normalizePmid(typeof details?.pmid === "string" ? details.pmid : undefined);
    const doi = normalizeDoi(typeof details?.doi === "string" ? details.doi : undefined);
    const s2PaperId = typeof details?.s2PaperId === "string" ? details.s2PaperId.trim() : undefined;
    const titleYearKey = toTitleYearKey(study.title, study.year);

    if (pmid) pmidMap.set(pmid, ref);
    if (doi) doiMap.set(doi, ref);
    if (s2PaperId) s2IdMap.set(s2PaperId, ref);
    if (titleYearKey) {
      const bucket = titleYearMap.get(titleYearKey) ?? [];
      bucket.push(ref);
      titleYearMap.set(titleYearKey, bucket);
    }
  }

  const unique: SearchResult[] = [];
  const duplicates: DuplicateMatch[] = [];

  for (const result of results) {
    const normalizedPmid = normalizePmid(result.pmid);
    const normalizedDoi = normalizeDoi(result.doi);
    const pmidRef = normalizedPmid ? pmidMap.get(normalizedPmid) : undefined;
    const doiRef = normalizedDoi ? doiMap.get(normalizedDoi) : undefined;
    const s2Id = result.metadata?.s2PaperId;
    const s2Ref = (typeof s2Id === "string") ? s2IdMap.get(s2Id) : undefined;
    const titleYearKey = toTitleYearKey(result.title, result.year);
    const existingForTitleYear = titleYearKey ? titleYearMap.get(titleYearKey) ?? [] : [];
    const resultAuthorToken = firstAuthorToken(result.authors);
    const titleYearRef = existingForTitleYear.find((ref) => isTitleYearAuthorMatch(ref, resultAuthorToken));

    if (pmidRef) {
      duplicates.push({
        result,
        matchedBy: "pmid",
        matchedValue: normalizedPmid!,
        existingStudyId: pmidRef.id,
        existingTitle: pmidRef.title,
      });
    } else if (doiRef) {
      duplicates.push({
        result,
        matchedBy: "doi",
        matchedValue: normalizedDoi!,
        existingStudyId: doiRef.id,
        existingTitle: doiRef.title,
      });
    } else if (s2Ref) {
      duplicates.push({
        result,
        matchedBy: "s2PaperId",
        matchedValue: s2Id as string,
        existingStudyId: s2Ref.id,
        existingTitle: s2Ref.title,
      });
    } else if (titleYearRef && titleYearKey) {
      duplicates.push({
        result,
        matchedBy: "titleYear",
        matchedValue: titleYearKey,
        existingStudyId: titleYearRef.id,
        existingTitle: titleYearRef.title,
      });
    } else {
      unique.push(result);

      // Update maps so we also dedupe repeated items within the same incoming batch.
      const ref: ExistingStudyRef = {
        id: `incoming:${unique.length}`,
        title: result.title,
        authorToken: resultAuthorToken,
      };
      if (normalizedPmid) pmidMap.set(normalizedPmid, ref);
      if (normalizedDoi) doiMap.set(normalizedDoi, ref);
      if (typeof s2Id === "string" && s2Id.trim().length > 0) s2IdMap.set(s2Id, ref);
      if (titleYearKey) {
        const bucket = titleYearMap.get(titleYearKey) ?? [];
        bucket.push(ref);
        titleYearMap.set(titleYearKey, bucket);
      }
    }
  }

  return { unique, duplicates };
}
