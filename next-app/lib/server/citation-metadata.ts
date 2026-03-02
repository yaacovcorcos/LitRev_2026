import type { CitationMetadata } from "@/lib/citation-types";
import {
    extractDoi,
    extractPmid,
    normalizeDoi,
    resolveCitationKey,
} from "@/lib/citation-key";

/** Cache for citation metadata (in-memory, per-process). */
const metadataCache = new Map<string, CitationMetadata | null>();
const inFlightRequests = new Map<string, Promise<CitationMetadata | null>>();

const SUCCESS_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const FAILURE_CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
export const METADATA_CACHE_LIMIT = 2000;
const cacheTimestamps = new Map<string, number>();

function getCached(key: string): CitationMetadata | null | undefined {
    const timestamp = cacheTimestamps.get(key);
    if (!timestamp) return undefined;

    const cachedValue = metadataCache.get(key);
    const ttl = cachedValue ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS;

    if (Date.now() - timestamp > ttl) {
        metadataCache.delete(key);
        cacheTimestamps.delete(key);
        return undefined;
    }

    return cachedValue;
}

function setCache(key: string, value: CitationMetadata | null): void {
    // Refresh insertion order when rewriting an existing key.
    metadataCache.delete(key);
    cacheTimestamps.delete(key);
    metadataCache.set(key, value);
    cacheTimestamps.set(key, Date.now());

    while (cacheTimestamps.size > METADATA_CACHE_LIMIT) {
        const oldestKey = cacheTimestamps.keys().next().value;
        if (!oldestKey) break;
        cacheTimestamps.delete(oldestKey);
        metadataCache.delete(oldestKey);
    }
}

export { normalizeDoi, extractPmid, extractDoi };

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
    const keyParts = resolveCitationKey(url);
    if (!keyParts) return null;

    const cached = getCached(keyParts.cacheKey);
    if (cached !== undefined) return cached;

    const pending = inFlightRequests.get(keyParts.cacheKey);
    if (pending) return pending;

    const requestPromise = resolveCitationMetadata(url)
        .then((metadata) => {
            setCache(keyParts.cacheKey, metadata);
            return metadata;
        })
        .finally(() => {
            inFlightRequests.delete(keyParts.cacheKey);
        });

    inFlightRequests.set(keyParts.cacheKey, requestPromise);
    return requestPromise;
}

export function __clearCitationMetadataCacheForTests(): void {
    metadataCache.clear();
    cacheTimestamps.clear();
    inFlightRequests.clear();
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
        const citationCountRaw = work["is-referenced-by-count"];
        const citationCount =
            typeof citationCountRaw === "number" && Number.isFinite(citationCountRaw)
                ? citationCountRaw
                : undefined;

        return {
            title: title ?? "Untitled",
            authors,
            year,
            journal: journal || undefined,
            citationCount,
            citationCountSource: citationCount !== undefined ? "crossref" : undefined,
            citationCountFetchedAt: citationCount !== undefined ? new Date().toISOString() : undefined,
            canonicalUrl: `https://doi.org/${normalizedDoi}`,
            doi: normalizedDoi,
        };
    } catch (error) {
        console.error("[citation-metadata] Crossref fetch failed:", error);
        return null;
    }
}
