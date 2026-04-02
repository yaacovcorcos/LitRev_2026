import "server-only";

import type { SearchResult, SearchResponse } from "@/types/search";
import { fetchCrossrefMetadata, normalizeDoi } from "@/lib/server/citation-metadata";

const OPENALEX_BASE = "https://api.openalex.org/works";
const MAX_RESULTS = 100;
const CROSSREF_ENRICH_LIMIT = 10;

let lastRequestTime = 0;

type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  ids?: {
    openalex?: string | null;
    doi?: string | null;
    pmid?: string | null;
  } | null;
  display_name?: string | null;
  title?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
  }> | null;
  primary_location?: {
    source?: { display_name?: string | null } | null;
  } | null;
  biblio?: {
    volume?: string | number | null;
    issue?: string | number | null;
    first_page?: string | number | null;
    last_page?: string | number | null;
  } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  concepts?: Array<{ display_name?: string | null; score?: number | null }> | null;
  cited_by_count?: number | null;
  type?: string | null;
  open_access?: { is_oa?: boolean | null } | null;
};

type OpenAlexSearchResponse = {
  meta?: {
    count?: number;
    next_cursor?: string | null;
  };
  results?: OpenAlexWork[];
};

type YearRange = {
  start?: number;
  end?: number;
};

function getThrottleInterval(): number {
  return 120;
}

async function throttledFetch(url: string): Promise<Response> {
  const interval = getThrottleInterval();
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < interval) {
    await new Promise((resolve) => setTimeout(resolve, interval - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
}

function parseYearRange(yearRange?: string): YearRange {
  if (!yearRange) return {};
  const trimmed = yearRange.trim();
  if (!trimmed) return {};

  const match = trimmed.match(/^(\d{4})?\s*-\s*(\d{4})?$/);
  if (!match) return {};

  const start = match[1] ? parseInt(match[1], 10) : undefined;
  const end = match[2] ? parseInt(match[2], 10) : undefined;
  return { start, end };
}

function matchesYearRange(year: number | undefined, yearRange: YearRange): boolean {
  if (yearRange.start === undefined && yearRange.end === undefined) return true;
  if (!Number.isFinite(year)) return false;
  const resolvedYear = year as number;
  if (yearRange.start !== undefined && resolvedYear < yearRange.start) return false;
  if (yearRange.end !== undefined && resolvedYear > yearRange.end) return false;
  return true;
}

function extractPmid(input?: string | null): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  if (match?.[1]) return match[1];
  return undefined;
}

function reconstructAbstract(invertedIndex?: Record<string, number[]> | null): string | undefined {
  if (!invertedIndex || typeof invertedIndex !== "object") return undefined;

  const entries: Array<{ position: number; token: string }> = [];
  for (const [token, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (Number.isInteger(position) && position >= 0) {
        entries.push({ position, token });
      }
    }
  }

  if (entries.length === 0) return undefined;

  entries.sort((a, b) => a.position - b.position);
  const maxPosition = entries[entries.length - 1].position;
  const words = new Array<string>(maxPosition + 1);
  for (const entry of entries) {
    words[entry.position] = entry.token;
  }

  return words.filter((word): word is string => Boolean(word)).join(" ").trim() || undefined;
}

function parsePages(biblio?: OpenAlexWork["biblio"]): string | undefined {
  if (!biblio) return undefined;
  const first = biblio.first_page != null ? String(biblio.first_page).trim() : "";
  const last = biblio.last_page != null ? String(biblio.last_page).trim() : "";
  if (first && last) return `${first}-${last}`;
  if (first) return first;
  if (last) return last;
  return undefined;
}

export function parseOpenAlexWork(work: OpenAlexWork): SearchResult {
  const rawDoi = work.doi ?? work.ids?.doi ?? undefined;
  const doi = rawDoi ? normalizeDoi(rawDoi) : undefined;
  const pmid = extractPmid(work.ids?.pmid);

  const title = (work.display_name ?? work.title ?? "Untitled").trim() || "Untitled";
  const authorNames =
    work.authorships
      ?.map((a) => a.author?.display_name?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];
  const authors = authorNames.length > 0 ? authorNames.join(", ") : "Unknown";

  let year = work.publication_year ?? null;
  let yearEstimated = false;
  if (year == null || !Number.isFinite(year)) {
    const parsed = work.publication_date ? parseInt(work.publication_date.slice(0, 4), 10) : NaN;
    if (Number.isFinite(parsed)) {
      year = parsed;
    } else {
      year = new Date().getFullYear();
      yearEstimated = true;
    }
  }

  const journal =
    work.primary_location?.source?.display_name?.trim() || undefined;
  const volume = work.biblio?.volume != null ? String(work.biblio.volume) : undefined;
  const issue = work.biblio?.issue != null ? String(work.biblio.issue) : undefined;
  const pages = parsePages(work.biblio);

  const abstract = reconstructAbstract(work.abstract_inverted_index);
  const keywords =
    work.concepts
      ?.filter((concept) => (concept.score ?? 0) >= 0.3 && typeof concept.display_name === "string")
      .map((concept) => concept.display_name!.trim())
      .filter((name): name is string => Boolean(name))
      .slice(0, 8) ?? [];

  const metadata: Record<string, unknown> = {
    openAlexId: work.id ?? work.ids?.openalex ?? undefined,
    citedByCount: work.cited_by_count ?? undefined,
    type: work.type ?? undefined,
    isOpenAccess: work.open_access?.is_oa ?? undefined,
  };
  if (yearEstimated) {
    metadata.yearEstimated = true;
  }

  return {
    pmid,
    doi,
    title,
    authors,
    year,
    journal,
    volume,
    issue,
    pages,
    abstract,
    keywords: keywords.length > 0 ? keywords : undefined,
    source: "openalex",
    sourceUrl: work.id ?? work.ids?.openalex ?? undefined,
    metadata,
  };
}

function shouldEnrichFromCrossref(result: SearchResult): boolean {
  if (!result.doi) return false;
  if (!result.title || result.title === "Untitled") return true;
  if (!result.journal) return true;
  if (!result.authors || result.authors === "Unknown") return true;
  return false;
}

async function enrichFromCrossref(results: SearchResult[]): Promise<void> {
  const candidates = results
    .map((result) => ({ result }))
    .filter((item) => shouldEnrichFromCrossref(item.result))
    .slice(0, CROSSREF_ENRICH_LIMIT);

  await Promise.all(
    candidates.map(async ({ result }) => {
      const doi = result.doi;
      if (!doi) return;
      const crossref = await fetchCrossrefMetadata(doi);
      if (!crossref) return;

      if ((!result.title || result.title === "Untitled") && crossref.title) {
        result.title = crossref.title;
      }
      if ((!result.authors || result.authors === "Unknown") && crossref.authors) {
        result.authors = crossref.authors;
      }
      if (!result.journal && crossref.journal) {
        result.journal = crossref.journal;
      }
      if (crossref.year && ((result.metadata?.yearEstimated as boolean | undefined) || !Number.isFinite(result.year))) {
        result.year = crossref.year;
        if (result.metadata && "yearEstimated" in result.metadata) {
          delete result.metadata.yearEstimated;
        }
      }

      result.metadata = {
        ...(result.metadata ?? {}),
        crossrefEnriched: true,
      };
    })
  );
}

/**
 * Search OpenAlex works with optional year filtering.
 * Returns normalized SearchResult entries and cursor pagination.
 */
export async function searchOpenAlex(
  query: string,
  options?: { maxResults?: number; yearRange?: string; cursor?: string }
): Promise<SearchResponse> {
  const perPage = Math.min(Math.max(options?.maxResults ?? 10, 1), MAX_RESULTS);
  const cursor = options?.cursor ?? "*";

  const params = new URLSearchParams({
    search: query,
    "per-page": String(perPage),
    cursor,
  });
  const mailto = process.env.OPENALEX_EMAIL?.trim();
  if (mailto) {
    params.set("mailto", mailto);
  }

  const url = `${OPENALEX_BASE}?${params.toString()}`;
  const res = await throttledFetch(url);
  if (!res.ok) {
    throw new Error(`OpenAlex search failed: ${res.status}`);
  }

  const data = (await res.json()) as OpenAlexSearchResponse;
  const works = data.results ?? [];
  const parsed = works.map(parseOpenAlexWork);

  const yearFilter = parseYearRange(options?.yearRange);
  const filtered = parsed.filter((result) => matchesYearRange(result.year, yearFilter));
  await enrichFromCrossref(filtered);

  return {
    query,
    source: "openalex",
    totalResults: data.meta?.count ?? filtered.length,
    returnedCount: filtered.length,
    results: filtered,
    nextCursor: data.meta?.next_cursor ?? undefined,
  };
}
