import { resolveCitationKey } from "@/lib/citation-key";
import type { CitationResult, CitationSuccessResult } from "@/lib/citation-types";
import type { CitationResolutionDiagnostics } from "@/lib/citation-types";

export type CitationMetadataLoader = (url: string) => Promise<CitationResult>;

export type CitationCacheLoadResult = {
    result: CitationResult;
    cacheKey: string;
    fromCache: boolean;
    dedupedInFlight: boolean;
};

const metadataCache = new Map<string, CitationSuccessResult>();
const inFlightRequests = new Map<string, Promise<CitationResult>>();
const continuationAttemptCache = new Map<string, number>();
const CONTINUATION_SUPPRESSION_TTL_MS = 1000 * 60 * 5;

function getCacheKey(url: string): string {
    const key = resolveCitationKey(url)?.cacheKey;
    if (key) return key;
    return `url:${url}`;
}

export function getCitationMetadataFromClientCache(url: string): CitationSuccessResult | null {
    const cacheKey = getCacheKey(url);
    return metadataCache.get(cacheKey) ?? null;
}

function buildContinuationAttemptKey(
    cacheKey: string,
    diagnostics: CitationResolutionDiagnostics,
): string {
    return `${cacheKey}:${diagnostics.resolutionPath}:${diagnostics.reason}`;
}

function clearExpiredContinuationAttempt(key: string): void {
    const timestamp = continuationAttemptCache.get(key);
    if (typeof timestamp !== "number") return;
    if (Date.now() - timestamp > CONTINUATION_SUPPRESSION_TTL_MS) {
        continuationAttemptCache.delete(key);
    }
}

export async function loadCitationMetadataWithClientCache(
    url: string,
    loader: CitationMetadataLoader
): Promise<CitationCacheLoadResult> {
    const cacheKey = getCacheKey(url);
    const cached = metadataCache.get(cacheKey);
    if (cached) {
        return {
            cacheKey,
            fromCache: true,
            dedupedInFlight: false,
            result: cached,
        };
    }

    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) {
        const result = await inFlight;
        return {
            cacheKey,
            fromCache: false,
            dedupedInFlight: true,
            result,
        };
    }

    const requestPromise = loader(url)
        .then((result) => {
            if (result.success) {
                metadataCache.set(cacheKey, result);
            }
            return result;
        })
        .finally(() => {
            inFlightRequests.delete(cacheKey);
        });

    inFlightRequests.set(cacheKey, requestPromise);
    const result = await requestPromise;
    return {
        cacheKey,
        fromCache: false,
        dedupedInFlight: false,
        result,
    };
}

export function clearCitationMetadataClientCache(): void {
    metadataCache.clear();
    inFlightRequests.clear();
    continuationAttemptCache.clear();
}

export function patchCitationMetadataInClientCache(
    url: string,
    nextResult: CitationSuccessResult,
): CitationSuccessResult {
    const cacheKey = getCacheKey(url);
    const current = metadataCache.get(cacheKey);
    const currentHasCount = typeof current?.data.citationCount === "number";
    const nextHasCount = typeof nextResult.data.citationCount === "number";
    const patched: CitationSuccessResult = current
        ? {
            success: true,
            data: {
                ...current.data,
                citationCount: currentHasCount && !nextHasCount
                    ? current.data.citationCount
                    : nextResult.data.citationCount,
                citationCountSource: currentHasCount && !nextHasCount
                    ? current.data.citationCountSource
                    : nextResult.data.citationCountSource,
                citationCountFetchedAt: currentHasCount && !nextHasCount
                    ? current.data.citationCountFetchedAt
                    : nextResult.data.citationCountFetchedAt,
            },
            meta: {
                diagnostics: currentHasCount && !nextHasCount
                    ? current.meta.diagnostics
                    : nextResult.meta.diagnostics,
            },
        }
        : nextResult;

    metadataCache.set(cacheKey, patched);

    if (typeof patched.data.citationCount === "number") {
        clearCitationContinuationAttemptForUrl(url);
    }

    return patched;
}

export function shouldAttemptCitationContinuation(
    url: string,
    diagnostics: CitationResolutionDiagnostics,
): boolean {
    const key = buildContinuationAttemptKey(getCacheKey(url), diagnostics);
    clearExpiredContinuationAttempt(key);
    return !continuationAttemptCache.has(key);
}

export function markCitationContinuationAttempted(
    url: string,
    diagnostics: CitationResolutionDiagnostics,
): void {
    const key = buildContinuationAttemptKey(getCacheKey(url), diagnostics);
    continuationAttemptCache.set(key, Date.now());
}

export function clearCitationContinuationAttemptForUrl(url: string): void {
    const cacheKey = getCacheKey(url);
    for (const key of continuationAttemptCache.keys()) {
        if (key.startsWith(`${cacheKey}:`)) {
            continuationAttemptCache.delete(key);
        }
    }
}
