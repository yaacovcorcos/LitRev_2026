import type { CitationMetadata } from "@/lib/citation-types";

/** Cache for citation metadata (in-memory, per-process). */
const metadataCache = new Map<string, CitationMetadata | null>();

const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const cacheTimestamps = new Map<string, number>();

function getCached(key: string): CitationMetadata | null | undefined {
    const timestamp = cacheTimestamps.get(key);
    if (timestamp && Date.now() - timestamp > CACHE_TTL) {
        metadataCache.delete(key);
        cacheTimestamps.delete(key);
        return undefined;
    }
    return metadataCache.get(key);
}

function setCache(key: string, value: CitationMetadata | null): void {
    metadataCache.set(key, value);
    cacheTimestamps.set(key, Date.now());
}

/**
 * Normalize DOI to standard format: lowercase, no URL prefix.
 */
export function normalizeDoi(doi: string): string {
    const clean = doi
        .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
        .trim()
        .toLowerCase();
    return clean;
}

/**
 * Extract PMID from PubMed URL.
 */
export function extractPmid(url: string): string | null {
    const match = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
    return match ? match[1] : null;
}

/**
 * Extract DOI from doi.org URL.
 */
export function extractDoi(url: string): string | null {
    const match = url.match(/(?:dx\.)?doi\.org\/(10\.[^/]+\/[^\s]+)/i);
    return match ? match[1] : null;
}

/**
 * Resolve citation metadata from a PubMed or DOI URL.
 * Returns null if unable to fetch metadata.
 */
export async function resolveCitationMetadata(
    url: string
): Promise<CitationMetadata | null> {
    const pmid = extractPmid(url);
    const doi = extractDoi(url);

    if (pmid) {
        return fetchPubMedMetadata(pmid);
    }
    if (doi) {
        return fetchCrossrefMetadata(doi);
    }

    return null;
}

/**
 * Resolve citation metadata with normalized cache key.
 */
export async function resolveCitationMetadataCached(
    url: string
): Promise<CitationMetadata | null> {
    const pmid = extractPmid(url);
    const doi = extractDoi(url);

    const cacheKey = pmid ? `pmid:${pmid}` : doi ? `doi:${normalizeDoi(doi)}` : null;
    if (!cacheKey) return null;

    const cached = getCached(cacheKey);
    if (cached !== undefined) return cached;

    const metadata = await resolveCitationMetadata(url);
    setCache(cacheKey, metadata);
    return metadata;
}

// ─────────────────────────────────────────────────────────────────────────────
// PubMed Fetcher
// ─────────────────────────────────────────────────────────────────────────────

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

// Module-level throttle (shared with pubmed.ts but lightweight here)
let lastPubMedRequest = 0;

function getThrottleInterval(): number {
    return process.env.NCBI_API_KEY ? 100 : 340;
}

async function throttledFetch(url: string): Promise<Response> {
    const interval = getThrottleInterval();
    const now = Date.now();
    const elapsed = now - lastPubMedRequest;
    if (elapsed < interval) {
        await new Promise((resolve) => setTimeout(resolve, interval - elapsed));
    }
    lastPubMedRequest = Date.now();
    return fetch(url, { next: { revalidate: 3600 } }); // 1hr cache at fetch level
}

function buildPubMedParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set("tool", "litrev-citation-preview");
    if (process.env.NCBI_EMAIL) {
        params.set("email", process.env.NCBI_EMAIL);
    }
    if (process.env.NCBI_API_KEY) {
        params.set("api_key", process.env.NCBI_API_KEY);
    }
    return params;
}

/**
 * Fetch metadata for a single PMID from PubMed ESummary API.
 */
export async function fetchPubMedMetadata(
    pmid: string
): Promise<CitationMetadata | null> {
    try {
        const params = buildPubMedParams();
        params.set("db", "pubmed");
        params.set("id", pmid);
        params.set("retmode", "json");

        const url = `${EUTILS_BASE}/esummary.fcgi?${params}`;
        const res = await throttledFetch(url);
        if (!res.ok) return null;

        const data = await res.json();
        const doc = data?.result?.[pmid];
        if (!doc) return null;

        // Authors - ESummary returns a compact format
        const authorList = doc.authors ?? [];
        const authors = authorList
            .map((a: { name?: string }) => a.name)
            .filter(Boolean)
            .join(", ") || "Unknown";

        // Year from pubdate
        const pubdate = doc.pubdate ?? "";
        const yearMatch = pubdate.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

        // DOI from articleids
        const articleIds = doc.articleids ?? [];
        const doiEntry = articleIds.find((id: { idtype?: string }) => id.idtype === "doi");
        const doi = doiEntry?.value ?? undefined;

        return {
            title: doc.title ?? "Untitled",
            authors,
            year,
            journal: doc.fulljournalname || doc.source || undefined,
            canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
            pmid,
            doi,
        };
    } catch (error) {
        console.error("[citation-metadata] PubMed fetch failed:", error);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Crossref Fetcher (for DOI resolution)
// ─────────────────────────────────────────────────────────────────────────────

const CROSSREF_API = "https://api.crossref.org/works";
const CROSSREF_USER_AGENT = "LitRev/1.0 (mailto:support@litrev.app)";

/**
 * Fetch metadata for a DOI from Crossref API.
 */
export async function fetchCrossrefMetadata(
    doi: string
): Promise<CitationMetadata | null> {
    try {
        const normalizedDoi = normalizeDoi(doi);
        const url = `${CROSSREF_API}/${encodeURIComponent(normalizedDoi)}`;

        const res = await fetch(url, {
            headers: {
                "User-Agent": CROSSREF_USER_AGENT,
            },
            next: { revalidate: 3600 },
        });

        if (!res.ok) return null;

        const data = await res.json();
        const work = data?.message;
        if (!work) return null;

        // Title - may be array
        const titleArr = work.title ?? [];
        const title = Array.isArray(titleArr) ? titleArr[0] : titleArr;

        // Authors
        const authorArr = work.author ?? [];
        const authors = authorArr
            .map((a: { family?: string; given?: string; name?: string }) => {
                if (a.family && a.given) return `${a.family} ${a.given}`;
                if (a.family) return a.family;
                if (a.name) return a.name;
                return null;
            })
            .filter(Boolean)
            .join(", ") || "Unknown";

        // Year from published-print or published-online
        let year: number | undefined;
        const published = work["published-print"] ?? work["published-online"] ?? work["created"];
        if (published?.["date-parts"]?.[0]?.[0]) {
            year = published["date-parts"][0][0];
        }

        // Journal
        const containerTitle = work["container-title"];
        const journal = Array.isArray(containerTitle) ? containerTitle[0] : containerTitle;

        return {
            title: title ?? "Untitled",
            authors,
            year,
            journal: journal || undefined,
            canonicalUrl: `https://doi.org/${normalizedDoi}`,
            doi: normalizedDoi,
        };
    } catch (error) {
        console.error("[citation-metadata] Crossref fetch failed:", error);
        return null;
    }
}
