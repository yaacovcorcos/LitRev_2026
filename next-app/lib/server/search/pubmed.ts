import "server-only";

import { XMLParser } from "fast-xml-parser";
import type { SearchResult, SearchResponse } from "@/types/search";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PMID_BATCH_SIZE = 200;

type PubMedTextValue = string | number | { "#text"?: string | number };

type PubMedAuthor = {
  LastName?: string;
  Initials?: string;
  CollectiveName?: string;
};

type PubMedPubDate = {
  Year?: string | number;
  MedlineDate?: string;
};

type PubMedAbstractSection =
  | string
  | {
      Label?: string;
      "#text"?: string;
    };

type PubMedArticleId = {
  IdType?: string;
  "#text"?: string;
};

type PubMedMeshHeading = {
  DescriptorName?: string | { "#text"?: string };
};

type PubMedArticle = {
  MedlineCitation?: {
    PMID?: PubMedTextValue;
    Article?: {
      ArticleTitle?: PubMedTextValue;
      AuthorList?: { Author?: PubMedAuthor[] };
      Journal?: {
        JournalIssue?: {
          PubDate?: PubMedPubDate;
          Volume?: string | number;
          Issue?: string | number;
        };
      };
      Abstract?: { AbstractText?: PubMedAbstractSection[] | PubMedAbstractSection };
      Pagination?: { MedlinePgn?: string | number };
    };
    MedlineJournalInfo?: { MedlineTA?: string };
    MeshHeadingList?: { MeshHeading?: PubMedMeshHeading[] };
  };
  PubmedData?: {
    ArticleIdList?: { ArticleId?: PubMedArticleId[] };
  };
};

type ParsedPubMedXml = {
  PubmedArticleSet?: {
    PubmedArticle?: PubMedArticle | PubMedArticle[];
  };
};

// Module-level throttle
let lastRequestTime = 0;

function getThrottleInterval(): number {
  return process.env.NCBI_API_KEY ? 100 : 340;
}

async function throttledFetch(url: string): Promise<Response> {
  const interval = getThrottleInterval();
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < interval) {
    await new Promise((resolve) => setTimeout(resolve, interval - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url);
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

/**
 * Search PubMed with a query string. Returns parsed results.
 */
export async function searchPubMed(
  query: string,
  options?: { maxResults?: number; retstart?: number }
): Promise<SearchResponse> {
  const maxResults = Math.min(options?.maxResults ?? 10, 50);
  const retstart = options?.retstart ?? 0;

  // Step 1: ESearch to get PMIDs
  const searchParams = buildBaseParams();
  searchParams.set("db", "pubmed");
  searchParams.set("term", query);
  searchParams.set("retmax", String(maxResults));
  searchParams.set("retstart", String(retstart));
  searchParams.set("retmode", "json");

  const searchUrl = `${EUTILS_BASE}/esearch.fcgi?${searchParams}`;
  const searchRes = await throttledFetch(searchUrl);
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
  const results = await fetchPubMedArticles(pmids);

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
  pmids: string[]
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  for (let i = 0; i < pmids.length; i += PMID_BATCH_SIZE) {
    const batch = pmids.slice(i, i + PMID_BATCH_SIZE);

    const fetchParams = buildBaseParams();
    fetchParams.set("db", "pubmed");
    fetchParams.set("id", batch.join(","));
    fetchParams.set("retmode", "xml");

    const fetchUrl = `${EUTILS_BASE}/efetch.fcgi?${fetchParams}`;
    const fetchRes = await throttledFetch(fetchUrl);
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
  const parsed = xmlParser.parse(xml) as ParsedPubMedXml;
  const articleSet = parsed?.PubmedArticleSet?.PubmedArticle;

  if (!articleSet) return [];

  const articles = Array.isArray(articleSet) ? articleSet : [articleSet];

  return articles.map((article): SearchResult => {
    const medlineCitation = article.MedlineCitation;
    const articleData = medlineCitation?.Article;

    // Title
    const title = extractText(articleData?.ArticleTitle) || "Untitled";

    // Authors
    const authorList = articleData?.AuthorList?.Author;
    const authors = formatAuthors(authorList);

    // Year
    const pubDate = articleData?.Journal?.JournalIssue?.PubDate;
    const year = parseYear(pubDate);

    // Abstract
    const abstractTexts = articleData?.Abstract?.AbstractText;
    const abstract = formatAbstract(abstractTexts);

    // DOI
    const articleIds = article.PubmedData?.ArticleIdList?.ArticleId;
    const doi = extractArticleId(articleIds, "doi");

    // PMID
    const pmid = extractText(medlineCitation?.PMID);

    // Journal
    const journal = medlineCitation?.MedlineJournalInfo?.MedlineTA ?? "";

    // Volume, Issue, Pages (coerce to string — parser may return numbers)
    const journalIssue = articleData?.Journal?.JournalIssue;
    const volume = journalIssue?.Volume != null ? String(journalIssue.Volume) : undefined;
    const issue = journalIssue?.Issue != null ? String(journalIssue.Issue) : undefined;
    const pages = articleData?.Pagination?.MedlinePgn != null ? String(articleData.Pagination.MedlinePgn) : undefined;

    // MeSH terms
    const meshHeadings = medlineCitation?.MeshHeadingList?.MeshHeading;
    const keywords = extractMeshTerms(meshHeadings);

    return {
      pmid: pmid || undefined,
      doi: doi || undefined,
      title,
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

function extractText(value: PubMedTextValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && value["#text"] != null) return String(value["#text"]);
  return "";
}

function formatAuthors(authorList: PubMedAuthor[] | undefined): string {
  if (!authorList || !Array.isArray(authorList)) return "Unknown";

  const names = authorList
    .map((author) => {
      const last = author.LastName;
      const initials = author.Initials;
      if (last && initials) return `${last} ${initials}`;
      if (last) return last;
      if (author.CollectiveName) return author.CollectiveName;
      return null;
    })
    .filter(Boolean);

  return names.length > 0 ? names.join(", ") : "Unknown";
}

function parseYear(pubDate: PubMedPubDate | undefined): number {
  if (!pubDate) return new Date().getFullYear();

  if (pubDate.Year) {
    const y = parseInt(String(pubDate.Year), 10);
    if (Number.isFinite(y)) return y;
  }

  // MedlineDate fallback (e.g. "2023 Jan-Feb")
  if (pubDate.MedlineDate) {
    const match = String(pubDate.MedlineDate).match(/(\d{4})/);
    if (match) return parseInt(match[1], 10);
  }

  return new Date().getFullYear();
}

function formatAbstract(
  abstractTexts: PubMedAbstractSection[] | PubMedAbstractSection | undefined
): string {
  if (!abstractTexts) return "";

  if (Array.isArray(abstractTexts)) {
    return abstractTexts
      .map((section) => {
        if (typeof section === "string") {
          return section;
        }
        const label = section.Label;
        const text = section["#text"] ?? "";
        if (label && text) return `${label}: ${text}`;
        return text;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  if (typeof abstractTexts === "string") return abstractTexts;
  return abstractTexts?.["#text"] ?? "";
}

function extractArticleId(
  articleIds: PubMedArticleId[] | undefined,
  idType: string
): string | undefined {
  if (!articleIds || !Array.isArray(articleIds)) return undefined;
  const match = articleIds.find((id) => id?.IdType === idType);
  return match?.["#text"] ?? undefined;
}

function extractMeshTerms(meshHeadings: PubMedMeshHeading[] | undefined): string[] {
  if (!meshHeadings || !Array.isArray(meshHeadings)) return [];
  return meshHeadings
    .map((heading) => {
      const descriptor = heading?.DescriptorName;
      if (typeof descriptor === "string") return descriptor;
      return descriptor?.["#text"] ?? null;
    })
    .filter(Boolean) as string[];
}
