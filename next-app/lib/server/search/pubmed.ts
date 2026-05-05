import "server-only";

import { XMLParser } from "fast-xml-parser";
import type { SearchResult, SearchResponse } from "@/types/search";
import { parseOpaqueOffsetCursor } from "@/lib/search-contract";
import { throwIfAborted } from "@/lib/ai/abort";
import { sleep } from "@/lib/server/utils/retry";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PMID_BATCH_SIZE = 200;

// Module-level throttle
let lastRequestTime = 0;

function getThrottleInterval(): number {
  return process.env.NCBI_API_KEY ? 100 : 340;
}

async function throttledFetch(url: string, signal?: AbortSignal): Promise<Response> {
  throwIfAborted(signal);
  const interval = getThrottleInterval();
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < interval) {
    await sleep(interval - elapsed, signal);
  }
  throwIfAborted(signal);
  lastRequestTime = Date.now();
  return fetch(url, { signal });
}

function buildBaseParams(): URLSearchParams {
  const params = new URLSearchParams();
  params.set("tool", "litrev");
  if (process.env.NCBI_EMAIL) {
    params.set("email", process.env.NCBI_EMAIL);
  }
  if (process.env.NCBI_API_KEY) {
    params.set("api_key", process.env.NCBI_API_KEY);
  }
  return params;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) =>
    ["Author", "MeshHeading", "ArticleId", "AbstractText"].includes(name),
});

type XmlRecord = Record<string, unknown>;

function asRecord(value: unknown): XmlRecord | undefined {
  return typeof value === "object" && value !== null ? (value as XmlRecord) : undefined;
}

/**
 * Search PubMed with a query string. Returns parsed results.
 */
export async function searchPubMed(
  query: string,
  options?: { maxResults?: number; cursor?: string; retstart?: number; signal?: AbortSignal }
): Promise<SearchResponse> {
  throwIfAborted(options?.signal);
  const maxResults = Math.min(options?.maxResults ?? 10, 50);
  const retstart = options?.cursor !== undefined
    ? parseOpaqueOffsetCursor(options.cursor, "PubMed") ?? 0
    : options?.retstart ?? 0;

  // Step 1: ESearch to get PMIDs
  const searchParams = buildBaseParams();
  searchParams.set("db", "pubmed");
  searchParams.set("term", query);
  searchParams.set("retmax", String(maxResults));
  searchParams.set("retstart", String(retstart));
  searchParams.set("retmode", "json");

  const searchUrl = `${EUTILS_BASE}/esearch.fcgi?${searchParams}`;
  const searchRes = await throttledFetch(searchUrl, options?.signal);
  if (!searchRes.ok) {
    throw new Error(`PubMed ESearch failed: ${searchRes.status}`);
  }

  const searchData = await searchRes.json();
  const esearchResult = searchData.esearchresult;
  const pmids: string[] = esearchResult?.idlist ?? [];
  const totalResults = parseInt(esearchResult?.count ?? "0", 10);

  if (pmids.length === 0) {
    return {
      query,
      source: "pubmed",
      totalResults,
      returnedCount: 0,
      results: [],
    };
  }

  // Step 2: EFetch to get article details
  const results = await fetchPubMedArticles(pmids, { signal: options?.signal });

  const nextRetstart = retstart + maxResults;
  return {
    query,
    source: "pubmed",
    totalResults,
    returnedCount: results.length,
    results,
    nextCursor: nextRetstart < totalResults ? String(nextRetstart) : undefined,
  };
}

/**
 * Fetch full article details for a list of PMIDs.
 * Chunks into batches of 200 to avoid URL length limits.
 */
export async function fetchPubMedArticles(
  pmids: string[],
  options?: { signal?: AbortSignal },
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  for (let i = 0; i < pmids.length; i += PMID_BATCH_SIZE) {
    throwIfAborted(options?.signal);
    const batch = pmids.slice(i, i + PMID_BATCH_SIZE);

    const fetchParams = buildBaseParams();
    fetchParams.set("db", "pubmed");
    fetchParams.set("id", batch.join(","));
    fetchParams.set("retmode", "xml");

    const fetchUrl = `${EUTILS_BASE}/efetch.fcgi?${fetchParams}`;
    const fetchRes = await throttledFetch(fetchUrl, options?.signal);
    if (!fetchRes.ok) {
      throw new Error(`PubMed EFetch failed: ${fetchRes.status}`);
    }

    const xml = await fetchRes.text();
    const parsed = parsePubMedXml(xml);
    results.push(...parsed);
  }

  return results;
}

/**
 * Parse PubMed XML response into SearchResult[].
 */
export function parsePubMedXml(xml: string): SearchResult[] {
  const parsed = asRecord(xmlParser.parse(xml));
  const articleSet = asRecord(parsed?.PubmedArticleSet)?.PubmedArticle;

  if (!articleSet) return [];

  const articles = Array.isArray(articleSet) ? articleSet : [articleSet];

  return articles.map((article): SearchResult => {
    const articleRecord = asRecord(article);
    const medlineCitation = asRecord(articleRecord?.MedlineCitation);
    const articleData = asRecord(medlineCitation?.Article);

    // Title
    const title = articleData?.ArticleTitle ?? "Untitled";

    // Authors
    const authorList = asRecord(articleData?.AuthorList)?.Author;
    const authors = formatAuthors(authorList);

    // Year
    const pubDate = asRecord(asRecord(articleData?.Journal)?.JournalIssue)?.PubDate;
    const year = parseYear(pubDate);

    // Abstract
    const abstractTexts = asRecord(articleData?.Abstract)?.AbstractText;
    const abstract = formatAbstract(abstractTexts);

    // DOI
    const articleIds = asRecord(asRecord(articleRecord?.PubmedData)?.ArticleIdList)?.ArticleId;
    const doi = extractArticleId(articleIds, "doi");

    // PMID
    const pmidNode = medlineCitation?.PMID;
    const pmidRecord = asRecord(pmidNode);
    const pmid = String(pmidRecord?.["#text"] ?? pmidNode ?? "");

    // Journal
    const journalNode = asRecord(medlineCitation?.MedlineJournalInfo)?.MedlineTA;
    const journal = typeof journalNode === "string" ? journalNode : "";

    // Volume, Issue, Pages (coerce to string — parser may return numbers)
    const journalIssue = asRecord(asRecord(articleData?.Journal)?.JournalIssue);
    const pagination = asRecord(articleData?.Pagination);
    const volume = journalIssue?.Volume != null ? String(journalIssue.Volume) : undefined;
    const issue = journalIssue?.Issue != null ? String(journalIssue.Issue) : undefined;
    const pages = pagination?.MedlinePgn != null ? String(pagination.MedlinePgn) : undefined;

    // MeSH terms
    const meshHeadings = asRecord(medlineCitation?.MeshHeadingList)?.MeshHeading;
    const keywords = extractMeshTerms(meshHeadings);

    return {
      pmid: pmid || undefined,
      doi: doi || undefined,
      title: typeof title === "string" ? title : String(title),
      authors,
      year,
      journal: journal || undefined,
      volume,
      issue,
      pages,
      abstract: abstract || undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      source: "pubmed",
      sourceUrl: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
    };
  });
}

function formatAuthors(authorList: unknown): string {
  if (!Array.isArray(authorList)) return "Unknown";

  const names = authorList
    .map((author) => {
      const authorRecord = asRecord(author);
      const last = authorRecord?.LastName;
      const initials = authorRecord?.Initials;
      if (last && initials) return `${last} ${initials}`;
      if (last) return last;
      if (authorRecord?.CollectiveName) return authorRecord.CollectiveName;
      return null;
    })
    .filter(Boolean);

  return names.length > 0 ? names.join(", ") : "Unknown";
}

function parseYear(pubDate: unknown): number | undefined {
  const pubDateRecord = asRecord(pubDate);
  if (!pubDateRecord) return undefined;

  if (pubDateRecord.Year) {
    const rawYear = String(pubDateRecord.Year).trim();
    if (/^\d{4}$/.test(rawYear)) {
      const y = parseInt(rawYear, 10);
      if (Number.isFinite(y)) return y;
    }
  }

  // MedlineDate fallback (e.g. "2023 Jan-Feb")
  if (pubDateRecord.MedlineDate) {
    const match = String(pubDateRecord.MedlineDate).match(/(\d{4})/);
    if (match) return parseInt(match[1], 10);
  }

  return undefined;
}

function formatAbstract(abstractTexts: unknown): string {
  if (!abstractTexts) return "";

  if (Array.isArray(abstractTexts)) {
    return abstractTexts
      .map((section) => {
        const sectionRecord = asRecord(section);
        const label = sectionRecord?.Label;
        const text = typeof section === "string" ? section : (sectionRecord?.["#text"] ?? "");
        if (label && text) return `${label}: ${text}`;
        return text;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  if (typeof abstractTexts === "string") return abstractTexts;
  const abstractRecord = asRecord(abstractTexts);
  return abstractRecord?.["#text"] != null ? String(abstractRecord["#text"]) : "";
}

function extractArticleId(
  articleIds: unknown,
  idType: string
): string | undefined {
  if (!Array.isArray(articleIds)) return undefined;
  const match = articleIds.find((id) => asRecord(id)?.IdType === idType);
  const matchRecord = asRecord(match);
  return matchRecord?.["#text"] != null ? String(matchRecord["#text"]) : undefined;
}

function extractMeshTerms(meshHeadings: unknown): string[] {
  if (!Array.isArray(meshHeadings)) return [];
  return meshHeadings
    .map((heading) => {
      const descriptor = asRecord(heading)?.DescriptorName;
      if (typeof descriptor === "string") return descriptor;
      return asRecord(descriptor)?.["#text"] ?? null;
    })
    .filter((term): term is string => typeof term === "string" && term.length > 0);
}
