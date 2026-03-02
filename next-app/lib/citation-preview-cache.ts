import { resolveCitationKey } from "@/lib/citation-key";
import type { CitationMetadata, CitationResult } from "@/lib/citation-types";

export type CitationMetadataLoader = (url: string) => Promise<CitationResult>;

export type CitationCacheLoadResult = {
    result: CitationResult;
    cacheKey: string;
    fromCache: boolean;
    dedupedInFlight: boolean;
};

const metadataCache = new Map<string, CitationMetadata>();
const inFlightRequests = new Map<string, Promise<CitationResult>>();

function getCacheKey(url: string): string {
    const key = resolveCitationKey(url)?.cacheKey;
    if (key) return key;
    return `url:${url}`;
}

export function getCitationMetadataFromClientCache(url: string): CitationMetadata | null {
    const cacheKey = getCacheKey(url);
    return metadataCache.get(cacheKey) ?? null;
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
            result: { success: true, data: cached },
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
                metadataCache.set(cacheKey, result.data);
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
}
