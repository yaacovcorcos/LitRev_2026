export type CitationLinkType = "DOI" | "PubMed";

export type CitationKeyParts =
    | { cacheKey: `doi:${string}`; type: "DOI"; doi: string }
    | { cacheKey: `pmid:${string}`; type: "PubMed"; pmid: string };

const DOI_HOSTS = new Set(["doi.org", "dx.doi.org"]);
const PUBMED_HOSTS = new Set(["pubmed.ncbi.nlm.nih.gov"]);

function safeParseUrl(input: string): URL | null {
    try {
        return new URL(input);
    } catch {
        return null;
    }
}

/**
 * Normalize DOI to a stable lowercase canonical string with no URL prefix.
 */
export function normalizeDoi(doi: string): string {
    return doi
        .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
        .trim()
        .toLowerCase();
}

/**
 * Extract PMID from canonical PubMed URLs.
 */
export function extractPmid(url: string): string | null {
    const parsed = safeParseUrl(url);
    if (!parsed) return null;
    if (!PUBMED_HOSTS.has(parsed.hostname.toLowerCase())) return null;

    const match = parsed.pathname.match(/^\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
}

/**
 * Extract DOI from canonical DOI URLs.
 */
export function extractDoi(url: string): string | null {
    const parsed = safeParseUrl(url);
    if (!parsed) return null;
    if (!DOI_HOSTS.has(parsed.hostname.toLowerCase())) return null;

    const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, "").replace(/\/+$/, "");
    const match = path.match(/^(10\.[^/]+\/\S+)$/i);
    return match ? match[1] : null;
}

export function getCitationType(href?: string): CitationLinkType | null {
    if (!href) return null;
    const parsed = safeParseUrl(href);
    if (!parsed) return null;
    const host = parsed.hostname.toLowerCase();
    if (DOI_HOSTS.has(host)) return "DOI";
    if (PUBMED_HOSTS.has(host)) return "PubMed";
    return null;
}

/**
 * Resolve a stable citation cache key from a DOI/PubMed URL.
 */
export function resolveCitationKey(url: string): CitationKeyParts | null {
    const pmid = extractPmid(url);
    if (pmid) {
        return {
            cacheKey: `pmid:${pmid}`,
            type: "PubMed",
            pmid,
        };
    }

    const doi = extractDoi(url);
    if (!doi) return null;
    const normalizedDoi = normalizeDoi(doi);
    return {
        cacheKey: `doi:${normalizedDoi}`,
        type: "DOI",
        doi: normalizedDoi,
    };
}
