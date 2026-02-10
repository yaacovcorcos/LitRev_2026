import "server-only";

import type { SearchResult, SearchResponse } from "@/types/search";
import type { Study } from "@/types/ledger";

// ── Constants ────────────────────────────────────────────────────────────────

const S2_BASE = "https://api.semanticscholar.org/graph/v1";
const S2_RECOMMEND_BASE = "https://api.semanticscholar.org/recommendations/v1/papers/";
const S2_FIELDS = "paperId,externalIds,title,abstract,year,authors,venue,citationCount,influentialCitationCount,isOpenAccess,fieldsOfStudy,publicationDate";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// ── Types ────────────────────────────────────────────────────────────────────

export type S2Paper = {
    paperId: string;
    externalIds?: { DOI?: string; PMID?: string; ArXiv?: string; CorpusId?: string };
    title: string;
    abstract?: string | null;
    year?: number | null;
    authors?: { authorId?: string; name: string }[];
    venue?: string;
    citationCount?: number;
    influentialCitationCount?: number;
    isOpenAccess?: boolean;
    fieldsOfStudy?: string[] | null;
    publicationDate?: string | null;
};

// ── Throttle ─────────────────────────────────────────────────────────────────

let lastRequestTime = 0;

function getThrottleInterval(): number {
    return process.env.SEMANTIC_SCHOLAR_API_KEY ? 1050 : 3400;
}

async function throttledFetch(url: string, init?: RequestInit): Promise<Response> {
    const interval = getThrottleInterval();
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < interval) {
        await new Promise((resolve) => setTimeout(resolve, interval - elapsed));
    }
    lastRequestTime = Date.now();

    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(init?.headers as Record<string, string> ?? {}),
    };
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
        headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
    }

    return fetch(url, { ...init, headers });
}

/**
 * Fetch with exponential backoff on 429 (rate limit).
 * Respects Retry-After header if present.
 */
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const res = await throttledFetch(url, init);

        if (res.status !== 429 || attempt === MAX_RETRIES) {
            return res;
        }

        lastResponse = res;

        // Parse Retry-After header (seconds) or use exponential backoff
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : INITIAL_BACKOFF_MS * Math.pow(2, attempt);

        await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    return lastResponse!;
}

// ── Search ───────────────────────────────────────────────────────────────────

/**
 * Search Semantic Scholar with a query string. Returns parsed results.
 */
export async function searchSemanticScholar(
    query: string,
    options?: { maxResults?: number; yearRange?: string; offset?: number }
): Promise<SearchResponse> {
    const limit = Math.min(options?.maxResults ?? 10, 100);
    const offset = options?.offset ?? 0;

    const params = new URLSearchParams({
        query,
        fields: S2_FIELDS,
        limit: String(limit),
        offset: String(offset),
    });
    if (options?.yearRange) {
        params.set("year", options.yearRange);
    }

    const url = `${S2_BASE}/paper/search?${params}`;
    const res = await fetchWithRetry(url);

    if (res.status === 429) {
        throw new Error("Semantic Scholar rate limit exceeded after retries. Try again shortly.");
    }
    if (!res.ok) {
        throw new Error(`Semantic Scholar search failed: ${res.status}`);
    }

    const data = await res.json();
    const papers: S2Paper[] = data.data ?? [];
    const total: number = data.total ?? 0;

    const results = papers.map(parseS2Paper);
    const nextOffset = offset + limit;

    return {
        query,
        source: "semantic-scholar",
        totalResults: total,
        returnedCount: results.length,
        results,
        nextCursor: nextOffset < total && nextOffset < 1000 ? String(nextOffset) : undefined,
    };
}

// ── Recommendations ──────────────────────────────────────────────────────────

/**
 * Get paper recommendations based on positive (and optional negative) seed papers.
 */
export async function getRecommendations(
    positivePaperIds: string[],
    negativePaperIds?: string[],
    options?: { limit?: number }
): Promise<SearchResult[]> {
    const limit = Math.min(options?.limit ?? 10, 100);

    const body: Record<string, unknown> = { positivePaperIds };
    if (negativePaperIds?.length) {
        body.negativePaperIds = negativePaperIds;
    }

    const params = new URLSearchParams({
        fields: S2_FIELDS,
        limit: String(limit),
    });

    const url = `${S2_RECOMMEND_BASE}?${params}`;
    const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (res.status === 429) {
        throw new Error("Semantic Scholar recommendations rate limit exceeded. Try again shortly.");
    }
    if (!res.ok) {
        throw new Error(`Semantic Scholar recommendations failed: ${res.status}`);
    }

    const data = await res.json();
    const papers: S2Paper[] = data.recommendedPapers ?? [];
    return papers.map(parseS2Paper);
}

// ── Parser (pure, exported for testing) ──────────────────────────────────────

/**
 * Parse a Semantic Scholar paper object into a SearchResult.
 */
export function parseS2Paper(paper: S2Paper): SearchResult {
    const doi = paper.externalIds?.DOI || undefined;
    const pmid = paper.externalIds?.PMID || undefined;

    const authors = paper.authors?.length
        ? paper.authors.map((a) => a.name).join(", ")
        : "Unknown";

    // Year resolution: prefer explicit year, fallback to publicationDate, then current year
    let year: number | null = null;
    let yearEstimated = false;

    if (paper.year != null) {
        year = paper.year;
    } else if (paper.publicationDate) {
        const parsed = parseInt(paper.publicationDate.slice(0, 4), 10);
        if (Number.isFinite(parsed)) year = parsed;
    }

    if (year == null || !Number.isFinite(year)) {
        year = new Date().getFullYear();
        yearEstimated = true;
    }

    const metadata: Record<string, unknown> = {
        s2PaperId: paper.paperId,
        citationCount: paper.citationCount,
        influentialCitationCount: paper.influentialCitationCount,
        isOpenAccess: paper.isOpenAccess,
    };
    if (yearEstimated) {
        metadata.yearEstimated = true;
    }

    return {
        pmid: pmid || undefined,
        doi: doi || undefined,
        title: paper.title ?? "Untitled",
        authors,
        year,
        journal: paper.venue || undefined,
        abstract: paper.abstract || undefined,
        keywords: paper.fieldsOfStudy?.length ? paper.fieldsOfStudy : undefined,
        source: "semantic-scholar",
        sourceUrl: paper.paperId
            ? `https://www.semanticscholar.org/paper/${paper.paperId}`
            : undefined,
        metadata,
    };
}

// ── ID helpers ───────────────────────────────────────────────────────────────

/**
 * Build Semantic Scholar paper ID strings from study details.
 * S2 accepts DOI:xxx, PMID:xxx, or raw S2 paper IDs.
 * Priority: s2PaperId > DOI > PMID.
 */
export function buildS2PaperIds(studies: Study[]): string[] {
    const ids: string[] = [];
    for (const study of studies) {
        const d = study.details;
        if (d?.s2PaperId && typeof d.s2PaperId === "string") {
            ids.push(d.s2PaperId);
        } else if (d?.doi) {
            ids.push(`DOI:${d.doi}`);
        } else if (d?.pmid) {
            ids.push(`PMID:${d.pmid}`);
        }
    }
    return ids;
}
