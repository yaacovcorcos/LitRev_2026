import type {
    CitationMetadata,
    CitationResolutionDiagnostics,
} from "@/lib/citation-types";
import {
    extractDoi,
    extractPmid,
    normalizeDoi,
    resolveCitationKey,
} from "@/lib/citation-key";

export type CitationResolution = {
    metadata: CitationMetadata;
    diagnostics: CitationResolutionDiagnostics;
};

/** Cache for citation metadata (in-memory, per-process). */
const metadataCache = new Map<string, CitationResolution | null>();
const inFlightRequests = new Map<string, Promise<CitationResolution | null>>();

const SUCCESS_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const FAILURE_CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
export const METADATA_CACHE_LIMIT = 2000;
const cacheTimestamps = new Map<string, number>();
const PUBMED_COUNT_ENRICHMENT_BUDGET_MS = 1500;
const CROSSREF_REQUEST_TIMEOUT_MS = 1200;
const ICITE_REQUEST_TIMEOUT_MS = 1200;

function getCached(key: string): CitationResolution | null | undefined {
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

function setCache(key: string, value: CitationResolution | null): void {
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

type CitationCountSource = NonNullable<CitationMetadata["citationCountSource"]>;

type CitationCountDetails = {
    citationCount?: number;
    citationCountSource?: CitationCountSource;
    citationCountFetchedAt?: string;
};

type CountLookupResult =
    | {
        status: "count";
        details: CitationCountDetails;
    }
    | {
        status: "no_count";
    }
    | {
        status: "timeout";
    }
    | {
        status: "provider_error";
    };

type CrossrefLookupResult = {
    metadata: CitationMetadata | null;
    status: "ok" | "timeout" | "provider_error";
};

type RetryableContinuationReason = Extract<
    CitationResolutionDiagnostics["reason"],
    "icite_timeout" | "crossref_timeout" | "budget_exhausted"
>;

const CONTINUATION_BUDGET_MS = 2500;
const CONTINUATION_PROVIDER_TIMEOUT_MS = 1800;

function isUsableCitationCount(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function mergeCitationCount(
    base: CitationMetadata,
    incoming: CitationCountDetails | CitationMetadata | null,
): CitationMetadata {
    if (!incoming || !isUsableCitationCount(incoming.citationCount)) {
        return base;
    }

    return {
        ...base,
        citationCount: incoming.citationCount,
        citationCountSource: incoming.citationCountSource,
        citationCountFetchedAt: incoming.citationCountFetchedAt,
    };
}

function remainingBudgetMs(deadlineMs: number): number {
    return Math.max(0, deadlineMs - Date.now());
}

async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit,
    timeoutMs: number,
): Promise<{ response: Response | null; timedOut: boolean }> {
    if (timeoutMs <= 0) return { response: null, timedOut: true };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(input, {
            ...init,
            signal: controller.signal,
        });
        return { response, timedOut: false };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            return { response: null, timedOut: true };
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildResolution(
    metadata: CitationMetadata,
    diagnostics: CitationResolutionDiagnostics,
): CitationResolution {
    return {
        metadata,
        diagnostics,
    };
}

function buildPubMedBibliographyOnlyResolution(
    bibliography: CitationMetadata,
    reason: CitationResolutionDiagnostics["reason"],
    hadDoiFallbackCandidate: boolean,
): CitationResolution {
    return buildResolution(bibliography, {
        resolutionPath: "pubmed_bibliography_only",
        reason,
        resolvedWithCitationCount: false,
        hadDoiFallbackCandidate,
    });
}

function isRetryableContinuationReason(
    reason: CitationResolutionDiagnostics["reason"],
): reason is RetryableContinuationReason {
    return (
        reason === "icite_timeout"
        || reason === "crossref_timeout"
        || reason === "budget_exhausted"
    );
}

function patchCitationResolutionCountOnly(
    current: CitationResolution,
    incoming: CitationCountDetails | CitationMetadata | null,
    diagnostics: CitationResolutionDiagnostics,
): CitationResolution {
    return buildResolution(
        mergeCitationCount(current.metadata, incoming),
        diagnostics,
    );
}

function patchCachedCitationResolution(
    cacheKey: string,
    current: CitationResolution,
    incoming: CitationCountDetails | CitationMetadata | null,
    diagnostics: CitationResolutionDiagnostics,
): CitationResolution {
    const patched = patchCitationResolutionCountOnly(current, incoming, diagnostics);
    setCache(cacheKey, patched);
    return patched;
}

/**
 * Resolve citation metadata from a PubMed or DOI URL.
 * Returns null if unable to fetch metadata.
 */
export async function resolveCitationMetadata(
    url: string
): Promise<CitationResolution | null> {
    const pmid = extractPmid(url);
    const doi = extractDoi(url);

    if (pmid) {
        return resolvePubMedMetadata(pmid);
    }
    if (doi) {
        return resolveDoiMetadata(doi);
    }

    return null;
}

/**
 * Resolve citation metadata with normalized cache key.
 */
export async function resolveCitationMetadataCached(
    url: string
): Promise<CitationResolution | null> {
    const keyParts = resolveCitationKey(url);
    if (!keyParts) return null;

    const cached = getCached(keyParts.cacheKey);
    if (cached !== undefined) return cached;

    const pending = inFlightRequests.get(keyParts.cacheKey);
    if (pending) return pending;

    const requestPromise = resolveCitationMetadata(url)
        .then((resolution) => {
            setCache(keyParts.cacheKey, resolution);
            return resolution;
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
    lastPubMedRequest = 0;
}

export function __getCitationMetadataCacheEntryForTests(url: string): CitationResolution | null | undefined {
    const key = resolveCitationKey(url)?.cacheKey;
    if (!key) return undefined;
    return getCached(key);
}

// PubMed Fetcher

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
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
    return fetch(url, { next: { revalidate: 3600 } });
}

type ICiteResponse = {
    citation_count?: unknown;
    citedByPmidCount?: unknown;
};

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

        const authorList = doc.authors ?? [];
        const authors = authorList
            .map((a: { name?: string }) => a.name)
            .filter(Boolean)
            .join(", ") || "Unknown";

        const pubdate = doc.pubdate ?? "";
        const yearMatch = pubdate.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

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

async function fetchICiteCitationCount(
    pmid: string,
    timeoutMs = ICITE_REQUEST_TIMEOUT_MS,
): Promise<CountLookupResult> {
    try {
        const url = `https://icite.od.nih.gov/api/pubs/${encodeURIComponent(pmid)}`;
        const { response, timedOut } = await fetchWithTimeout(
            url,
            {
                next: { revalidate: 3600 },
            },
            timeoutMs,
        );

        if (timedOut) {
            return { status: "timeout" };
        }
        if (!response?.ok) {
            return { status: "provider_error" };
        }

        const data = await response.json() as ICiteResponse;
        const citationCount = isUsableCitationCount(data.citation_count)
            ? data.citation_count
            : isUsableCitationCount(data.citedByPmidCount)
                ? data.citedByPmidCount
                : undefined;

        if (!isUsableCitationCount(citationCount)) {
            return { status: "no_count" };
        }

        return {
            status: "count",
            details: {
                citationCount,
                citationCountSource: "icite",
                citationCountFetchedAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        console.error("[citation-metadata] iCite fetch failed:", error);
        return { status: "provider_error" };
    }
}

async function resolvePubMedMetadata(pmid: string): Promise<CitationResolution | null> {
    const deadlineMs = Date.now() + PUBMED_COUNT_ENRICHMENT_BUDGET_MS;
    const bibliographyPromise = fetchPubMedMetadata(pmid);
    const iCitePromise = fetchICiteCitationCount(
        pmid,
        Math.min(ICITE_REQUEST_TIMEOUT_MS, remainingBudgetMs(deadlineMs)),
    );

    const bibliography = await bibliographyPromise;
    if (!bibliography) return null;

    const hadDoiFallbackCandidate = Boolean(bibliography.doi);
    const iCiteResult = await iCitePromise;

    if (iCiteResult.status === "count") {
        return buildResolution(
            mergeCitationCount(bibliography, iCiteResult.details),
            {
                resolutionPath: "pubmed_icite",
                reason: "count_resolved",
                resolvedWithCitationCount: true,
                hadDoiFallbackCandidate,
            },
        );
    }

    if (!bibliography.doi) {
        return buildPubMedBibliographyOnlyResolution(
            bibliography,
            iCiteResult.status === "timeout"
                ? "icite_timeout"
                : iCiteResult.status === "provider_error"
                    ? "provider_error"
                    : "no_doi_fallback",
            false,
        );
    }

    const crossrefTimeoutMs = Math.min(CROSSREF_REQUEST_TIMEOUT_MS, remainingBudgetMs(deadlineMs));
    if (crossrefTimeoutMs <= 0) {
        return buildPubMedBibliographyOnlyResolution(
            bibliography,
            "budget_exhausted",
            hadDoiFallbackCandidate,
        );
    }

    const crossref = await fetchCrossrefMetadataWithStatus(bibliography.doi, {
        timeoutMs: crossrefTimeoutMs,
    });

    if (crossref.status === "ok" && isUsableCitationCount(crossref.metadata?.citationCount)) {
        return buildResolution(
            mergeCitationCount(bibliography, crossref.metadata),
            {
                resolutionPath: "pubmed_crossref_fallback",
                reason: "count_resolved",
                resolvedWithCitationCount: true,
                hadDoiFallbackCandidate,
            },
        );
    }

    return buildPubMedBibliographyOnlyResolution(
        bibliography,
        crossref.status === "timeout"
            ? "crossref_timeout"
            : crossref.status === "provider_error"
                ? "provider_error"
                : "crossref_no_count",
        hadDoiFallbackCandidate,
    );
}

// Crossref Fetcher

const CROSSREF_API = "https://api.crossref.org/works";
const CROSSREF_USER_AGENT = "LitRev/1.0 (mailto:support@litrev.app)";

async function fetchCrossrefMetadataWithStatus(
    doi: string,
    options?: {
        timeoutMs?: number;
    },
): Promise<CrossrefLookupResult> {
    try {
        const normalizedDoi = normalizeDoi(doi);
        const url = `${CROSSREF_API}/${encodeURIComponent(normalizedDoi)}`;

        const timedResponse = typeof options?.timeoutMs === "number"
            ? await fetchWithTimeout(
                url,
                {
                    headers: {
                        "User-Agent": CROSSREF_USER_AGENT,
                    },
                    next: { revalidate: 3600 },
                },
                options.timeoutMs,
            )
            : {
                response: await fetch(url, {
                    headers: {
                        "User-Agent": CROSSREF_USER_AGENT,
                    },
                    next: { revalidate: 3600 },
                }),
                timedOut: false,
            };

        if (timedResponse.timedOut) {
            return { metadata: null, status: "timeout" };
        }
        if (!timedResponse.response?.ok) {
            return { metadata: null, status: "provider_error" };
        }

        const data = await timedResponse.response.json();
        const work = data?.message;
        if (!work) {
            return { metadata: null, status: "provider_error" };
        }

        const titleArr = work.title ?? [];
        const title = Array.isArray(titleArr) ? titleArr[0] : titleArr;

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

        let year: number | undefined;
        const published = work["published-print"] ?? work["published-online"] ?? work["created"];
        if (published?.["date-parts"]?.[0]?.[0]) {
            year = published["date-parts"][0][0];
        }

        const containerTitle = work["container-title"];
        const journal = Array.isArray(containerTitle) ? containerTitle[0] : containerTitle;
        const citationCountRaw = work["is-referenced-by-count"];
        const citationCount =
            typeof citationCountRaw === "number" && Number.isFinite(citationCountRaw)
                ? citationCountRaw
                : undefined;

        return {
            status: "ok",
            metadata: {
                title: title ?? "Untitled",
                authors,
                year,
                journal: journal || undefined,
                citationCount,
                citationCountSource: citationCount !== undefined ? "crossref" : undefined,
                citationCountFetchedAt: citationCount !== undefined ? new Date().toISOString() : undefined,
                canonicalUrl: `https://doi.org/${normalizedDoi}`,
                doi: normalizedDoi,
            },
        };
    } catch (error) {
        console.error("[citation-metadata] Crossref fetch failed:", error);
        return { metadata: null, status: "provider_error" };
    }
}

export async function fetchCrossrefMetadata(
    doi: string,
    options?: {
        timeoutMs?: number;
    },
): Promise<CitationMetadata | null> {
    const result = await fetchCrossrefMetadataWithStatus(doi, options);
    return result.status === "ok" ? result.metadata : null;
}

export async function resolveDoiMetadata(doi: string): Promise<CitationResolution | null> {
    const result = await fetchCrossrefMetadataWithStatus(doi);
    if (result.status !== "ok" || !result.metadata) {
        // Keep unresolved DOI failures as generic action failures unless Crossref already
        // produced enough metadata to render a safe card.
        return null;
    }

    return buildResolution(result.metadata, {
        resolutionPath: result.metadata.citationCount !== undefined ? "doi_crossref" : "doi_no_count",
        reason: result.metadata.citationCount !== undefined ? "count_resolved" : "crossref_no_count",
        resolvedWithCitationCount: result.metadata.citationCount !== undefined,
        hadDoiFallbackCandidate: false,
    });
}

async function continuePubMedCitationResolution(
    current: CitationResolution,
): Promise<CitationResolution> {
    const { metadata } = current;
    const pmid = metadata.pmid;
    if (!pmid) {
        return current;
    }

    const deadlineMs = Date.now() + CONTINUATION_BUDGET_MS;
    const hadDoiFallbackCandidate = Boolean(metadata.doi);

    const iCiteResult = await fetchICiteCitationCount(
        pmid,
        Math.min(CONTINUATION_PROVIDER_TIMEOUT_MS, remainingBudgetMs(deadlineMs)),
    );

    if (iCiteResult.status === "count") {
        return patchCitationResolutionCountOnly(current, iCiteResult.details, {
            resolutionPath: "pubmed_icite",
            reason: "count_resolved",
            resolvedWithCitationCount: true,
            hadDoiFallbackCandidate,
        });
    }

    if (!metadata.doi) {
        return patchCitationResolutionCountOnly(current, null, {
            resolutionPath: "pubmed_bibliography_only",
            reason: iCiteResult.status === "timeout"
                ? "icite_timeout"
                : iCiteResult.status === "provider_error"
                    ? "provider_error"
                    : "no_doi_fallback",
            resolvedWithCitationCount: false,
            hadDoiFallbackCandidate: false,
        });
    }

    const crossrefTimeoutMs = Math.min(
        CONTINUATION_PROVIDER_TIMEOUT_MS,
        remainingBudgetMs(deadlineMs),
    );
    if (crossrefTimeoutMs <= 0) {
        return patchCitationResolutionCountOnly(current, null, {
            resolutionPath: "pubmed_bibliography_only",
            reason: "budget_exhausted",
            resolvedWithCitationCount: false,
            hadDoiFallbackCandidate,
        });
    }

    const crossref = await fetchCrossrefMetadataWithStatus(metadata.doi, {
        timeoutMs: crossrefTimeoutMs,
    });

    if (crossref.status === "ok" && isUsableCitationCount(crossref.metadata?.citationCount)) {
        return patchCitationResolutionCountOnly(current, crossref.metadata, {
            resolutionPath: "pubmed_crossref_fallback",
            reason: "count_resolved",
            resolvedWithCitationCount: true,
            hadDoiFallbackCandidate,
        });
    }

    return patchCitationResolutionCountOnly(current, null, {
        resolutionPath: "pubmed_bibliography_only",
        reason: crossref.status === "timeout"
            ? "crossref_timeout"
            : crossref.status === "provider_error"
                ? "provider_error"
                : "crossref_no_count",
        resolvedWithCitationCount: false,
        hadDoiFallbackCandidate,
    });
}

export async function continueCitationMetadataCached(
    url: string,
): Promise<CitationResolution | null> {
    const keyParts = resolveCitationKey(url);
    if (!keyParts) return null;

    const current = getCached(keyParts.cacheKey);
    if (!current) return null;

    if (isUsableCitationCount(current.metadata.citationCount)) {
        return current;
    }

    if (!isRetryableContinuationReason(current.diagnostics.reason)) {
        return current;
    }

    if (current.metadata.pmid) {
        const continued = await continuePubMedCitationResolution(current);
        return patchCachedCitationResolution(
            keyParts.cacheKey,
            current,
            continued.metadata,
            continued.diagnostics,
        );
    }

    return current;
}
