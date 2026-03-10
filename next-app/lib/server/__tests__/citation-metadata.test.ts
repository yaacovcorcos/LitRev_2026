import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    __clearCitationMetadataCacheForTests,
    fetchCrossrefMetadata,
    METADATA_CACHE_LIMIT,
    normalizeDoi,
    extractPmid,
    extractDoi,
    resolveCitationMetadataCached,
} from "../citation-metadata";

function jsonResponse(payload: unknown, ok = true): Response {
    return {
        ok,
        json: async () => payload,
    } as Response;
}

describe("citation-metadata utilities", () => {
    beforeEach(() => {
        __clearCitationMetadataCacheForTests();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("normalizeDoi", () => {
        it("removes https://doi.org/ prefix", () => {
            expect(normalizeDoi("https://doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
        });

        it("removes https://dx.doi.org/ prefix", () => {
            expect(normalizeDoi("https://dx.doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
        });

        it("removes http:// prefix", () => {
            expect(normalizeDoi("http://doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
        });

        it("lowercases the DOI", () => {
            expect(normalizeDoi("10.1000/XYZ123")).toBe("10.1000/xyz123");
        });

        it("trims whitespace", () => {
            expect(normalizeDoi("  10.1000/xyz123  ")).toBe("10.1000/xyz123");
        });

        it("handles DOI without prefix", () => {
            expect(normalizeDoi("10.1000/xyz123")).toBe("10.1000/xyz123");
        });
    });

    describe("extractPmid", () => {
        it("extracts PMID from standard pubmed URL", () => {
            expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/12345678/")).toBe("12345678");
        });

        it("extracts PMID from pubmed URL without trailing slash", () => {
            expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/12345678")).toBe("12345678");
        });

        it("extracts PMID with query params", () => {
            expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/12345678/?foo=bar")).toBe("12345678");
        });

        it("returns null for non-pubmed URLs", () => {
            expect(extractPmid("https://example.com/12345678")).toBeNull();
        });

        it("returns null for URLs without PMID", () => {
            expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/search/")).toBeNull();
        });
    });

    describe("extractDoi", () => {
        it("extracts DOI from doi.org URL", () => {
            expect(extractDoi("https://doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
        });

        it("extracts DOI from dx.doi.org URL", () => {
            expect(extractDoi("https://dx.doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
        });

        it("extracts complex DOI with special characters", () => {
            expect(extractDoi("https://doi.org/10.1016/j.cell.2023.01.001")).toBe("10.1016/j.cell.2023.01.001");
        });

        it("returns null for non-doi URLs", () => {
            expect(extractDoi("https://example.com/10.1000/xyz123")).toBeNull();
        });

        it("returns null for invalid DOI format", () => {
            expect(extractDoi("https://doi.org/invalid")).toBeNull();
        });
    });

    describe("resolveCitationMetadataCached", () => {
        it("dedupes concurrent cache misses for the same DOI", async () => {
            let resolveFetch!: (value: Response) => void;
            const fetchMock = vi.fn().mockImplementation(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveFetch = resolve;
                    })
            );
            vi.stubGlobal("fetch", fetchMock);

            const url = "https://doi.org/10.1000/xyz123";
            const first = resolveCitationMetadataCached(url);
            const second = resolveCitationMetadataCached(url);

            expect(fetchMock).toHaveBeenCalledTimes(1);

            resolveFetch({
                ok: true,
                json: async () => ({
                    message: {
                        title: ["Concurrent metadata"],
                        author: [{ family: "Doe", given: "Jane" }],
                        "container-title": ["Test Journal"],
                        created: { "date-parts": [[2024]] },
                    },
                }),
            } as Response);

            const [firstResult, secondResult] = await Promise.all([first, second]);
            expect(firstResult).toEqual(secondResult);
            expect(firstResult?.metadata.title).toBe("Concurrent metadata");
            expect(firstResult?.diagnostics).toMatchObject({
                resolutionPath: "doi_no_count",
                reason: "crossref_no_count",
            });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it("uses shorter TTL for failed lookups", async () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));

            const fetchMock = vi
                .fn()
                .mockResolvedValue({ ok: false } as Response);
            vi.stubGlobal("fetch", fetchMock);

            const url = "https://doi.org/10.1000/ttl-test";

            const first = await resolveCitationMetadataCached(url);
            expect(first).toBeNull();
            expect(fetchMock).toHaveBeenCalledTimes(1);

            vi.setSystemTime(new Date("2026-03-02T00:04:00.000Z"));
            const second = await resolveCitationMetadataCached(url);
            expect(second).toBeNull();
            expect(fetchMock).toHaveBeenCalledTimes(1);

            vi.setSystemTime(new Date("2026-03-02T00:06:00.000Z"));
            const third = await resolveCitationMetadataCached(url);
            expect(third).toBeNull();
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it("evicts oldest cache entries when cache exceeds size limit", async () => {
            vi.useRealTimers();

            const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
                const url = typeof input === "string" ? input : input.toString();
                const doi = decodeURIComponent(url.split("/works/")[1] ?? "");
                return {
                    ok: true,
                    json: async () => ({
                        message: {
                            title: [`Title ${doi}`],
                            author: [{ family: "Doe", given: "Jane" }],
                            "container-title": ["Test Journal"],
                            created: { "date-parts": [[2024]] },
                        },
                    }),
                } as Response;
            });
            vi.stubGlobal("fetch", fetchMock);

            for (let i = 0; i < METADATA_CACHE_LIMIT + 1; i += 1) {
                await resolveCitationMetadataCached(`https://doi.org/10.1000/cache-${i}`);
            }

            expect(fetchMock).toHaveBeenCalledTimes(METADATA_CACHE_LIMIT + 1);

            await resolveCitationMetadataCached("https://doi.org/10.1000/cache-0");
            expect(fetchMock).toHaveBeenCalledTimes(METADATA_CACHE_LIMIT + 2);
        });

        it("enriches PMID-only PubMed metadata with an iCite citation count", async () => {
            const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
                const url = typeof input === "string" ? input : input.toString();
                if (url.includes("esummary.fcgi")) {
                    return jsonResponse({
                        result: {
                            "12345678": {
                                title: "PMID only study",
                                authors: [{ name: "Doe J" }],
                                pubdate: "2024 Jan",
                                fulljournalname: "Journal of PMID",
                                articleids: [],
                            },
                        },
                    });
                }
                if (url.includes("icite.od.nih.gov/api/pubs/12345678")) {
                    return jsonResponse({
                        citation_count: 17,
                    });
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await resolveCitationMetadataCached("https://pubmed.ncbi.nlm.nih.gov/12345678/");
            expect(result?.metadata).toMatchObject({
                title: "PMID only study",
                journal: "Journal of PMID",
                pmid: "12345678",
                citationCount: 17,
                citationCountSource: "icite",
            });
            expect(result?.diagnostics).toMatchObject({
                resolutionPath: "pubmed_icite",
                reason: "count_resolved",
                resolvedWithCitationCount: true,
                hadDoiFallbackCandidate: false,
            });
        });

        it("falls back to Crossref when iCite does not return a count and PubMed provides a DOI", async () => {
            const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
                const url = typeof input === "string" ? input : input.toString();
                if (url.includes("esummary.fcgi")) {
                    return jsonResponse({
                        result: {
                            "22334455": {
                                title: "PubMed with DOI",
                                authors: [{ name: "Smith A" }],
                                pubdate: "2025",
                                fulljournalname: "PubMed Journal",
                                articleids: [{ idtype: "doi", value: "10.1000/fallback" }],
                            },
                        },
                    });
                }
                if (url.includes("icite.od.nih.gov/api/pubs/22334455")) {
                    return jsonResponse({});
                }
                if (url.includes("api.crossref.org/works/10.1000%2Ffallback")) {
                    return jsonResponse({
                        message: {
                            title: ["Crossref title"],
                            author: [{ family: "Fallback", given: "Casey" }],
                            "container-title": ["Crossref Journal"],
                            "published-online": { "date-parts": [[2023]] },
                            "is-referenced-by-count": 88,
                        },
                    });
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await resolveCitationMetadataCached("https://pubmed.ncbi.nlm.nih.gov/22334455/");
            expect(result?.metadata).toMatchObject({
                title: "PubMed with DOI",
                journal: "PubMed Journal",
                pmid: "22334455",
                doi: "10.1000/fallback",
                citationCount: 88,
                citationCountSource: "crossref",
            });
            expect(result?.diagnostics).toMatchObject({
                resolutionPath: "pubmed_crossref_fallback",
                reason: "count_resolved",
                resolvedWithCitationCount: true,
                hadDoiFallbackCandidate: true,
            });
        });

        it("treats an iCite zero count as valid and does not fall through to Crossref", async () => {
            const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
                const url = typeof input === "string" ? input : input.toString();
                if (url.includes("esummary.fcgi")) {
                    return jsonResponse({
                        result: {
                            "33445566": {
                                title: "Zero citation study",
                                authors: [{ name: "Ng B" }],
                                pubdate: "2026",
                                fulljournalname: "Zero Journal",
                                articleids: [{ idtype: "doi", value: "10.1000/zero" }],
                            },
                        },
                    });
                }
                if (url.includes("icite.od.nih.gov/api/pubs/33445566")) {
                    return jsonResponse({
                        citation_count: 0,
                    });
                }
                if (url.includes("api.crossref.org/works/10.1000%2Fzero")) {
                    throw new Error("Crossref should not be called when iCite returns 0");
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await resolveCitationMetadataCached("https://pubmed.ncbi.nlm.nih.gov/33445566/");
            expect(result?.metadata).toMatchObject({
                title: "Zero citation study",
                citationCount: 0,
                citationCountSource: "icite",
            });
        });

        it("keeps PubMed bibliography authoritative when Crossref adds only count fields", async () => {
            const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
                const url = typeof input === "string" ? input : input.toString();
                if (url.includes("esummary.fcgi")) {
                    return jsonResponse({
                        result: {
                            "44556677": {
                                title: "PubMed canonical title",
                                authors: [{ name: "PubMed Author" }],
                                pubdate: "2024 Jul",
                                fulljournalname: "PubMed Canonical Journal",
                                articleids: [{ idtype: "doi", value: "10.1000/owned" }],
                            },
                        },
                    });
                }
                if (url.includes("icite.od.nih.gov/api/pubs/44556677")) {
                    return jsonResponse({
                        citation_count: null,
                    });
                }
                if (url.includes("api.crossref.org/works/10.1000%2Fowned")) {
                    return jsonResponse({
                        message: {
                            title: ["Crossref competing title"],
                            author: [{ family: "Crossref", given: "Override" }],
                            "container-title": ["Crossref Competing Journal"],
                            "published-online": { "date-parts": [[1999]] },
                            "is-referenced-by-count": 41,
                        },
                    });
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await resolveCitationMetadataCached("https://pubmed.ncbi.nlm.nih.gov/44556677/");
            expect(result?.metadata).toMatchObject({
                title: "PubMed canonical title",
                authors: "PubMed Author",
                year: 2024,
                journal: "PubMed Canonical Journal",
                canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/44556677/",
                pmid: "44556677",
                doi: "10.1000/owned",
                citationCount: 41,
                citationCountSource: "crossref",
            });
        });

        it("soft-fails to bibliography only when iCite and Crossref do not provide a count", async () => {
            const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
                const url = typeof input === "string" ? input : input.toString();
                if (url.includes("esummary.fcgi")) {
                    return jsonResponse({
                        result: {
                            "55667788": {
                                title: "Bibliography only study",
                                authors: [{ name: "Lee R" }],
                                pubdate: "2023",
                                fulljournalname: "Fallback Journal",
                                articleids: [{ idtype: "doi", value: "10.1000/nocount" }],
                            },
                        },
                    });
                }
                if (url.includes("icite.od.nih.gov/api/pubs/55667788")) {
                    return jsonResponse({});
                }
                if (url.includes("api.crossref.org/works/10.1000%2Fnocount")) {
                    return jsonResponse({ message: { title: ["No count"] } });
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await resolveCitationMetadataCached("https://pubmed.ncbi.nlm.nih.gov/55667788/");
            expect(result?.metadata).toMatchObject({
                title: "Bibliography only study",
                pmid: "55667788",
                doi: "10.1000/nocount",
            });
            expect(result?.metadata.citationCount).toBeUndefined();
            expect(result?.metadata.citationCountSource).toBeUndefined();
            expect(result?.diagnostics).toMatchObject({
                resolutionPath: "pubmed_bibliography_only",
                reason: "crossref_no_count",
                resolvedWithCitationCount: false,
                hadDoiFallbackCandidate: true,
            });
        });

        it("reuses the cached merged PubMed result on repeated lookups", async () => {
            const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
                const url = typeof input === "string" ? input : input.toString();
                if (url.includes("esummary.fcgi")) {
                    return jsonResponse({
                        result: {
                            "66778899": {
                                title: "Cached PubMed study",
                                authors: [{ name: "Cache T" }],
                                pubdate: "2025",
                                fulljournalname: "Cache Journal",
                                articleids: [],
                            },
                        },
                    });
                }
                if (url.includes("icite.od.nih.gov/api/pubs/66778899")) {
                    return jsonResponse({
                        citation_count: 12,
                    });
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
            vi.stubGlobal("fetch", fetchMock);

            const first = await resolveCitationMetadataCached("https://pubmed.ncbi.nlm.nih.gov/66778899/");
            const second = await resolveCitationMetadataCached("https://pubmed.ncbi.nlm.nih.gov/66778899/");

            expect(first).toEqual(second);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it("returns bibliography without a count when iCite enrichment times out", async () => {
            vi.useFakeTimers();

            const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = typeof input === "string" ? input : input.toString();
                if (url.includes("esummary.fcgi")) {
                    return jsonResponse({
                        result: {
                            "77889900": {
                                title: "Timed enrichment study",
                                authors: [{ name: "Timeout A" }],
                                pubdate: "2026",
                                fulljournalname: "Timeout Journal",
                                articleids: [],
                            },
                        },
                    });
                }
                if (url.includes("icite.od.nih.gov/api/pubs/77889900")) {
                    return new Promise<Response>((_, reject) => {
                        init?.signal?.addEventListener("abort", () => {
                            const error = new Error("aborted");
                            error.name = "AbortError";
                            reject(error);
                        });
                    });
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
            vi.stubGlobal("fetch", fetchMock);

            const resultPromise = resolveCitationMetadataCached("https://pubmed.ncbi.nlm.nih.gov/77889900/");
            await vi.advanceTimersByTimeAsync(1600);
            const result = await resultPromise;

            expect(result?.metadata).toMatchObject({
                title: "Timed enrichment study",
                pmid: "77889900",
            });
            expect(result?.metadata.citationCount).toBeUndefined();
            expect(result?.diagnostics).toMatchObject({
                resolutionPath: "pubmed_bibliography_only",
                reason: "icite_timeout",
                resolvedWithCitationCount: false,
                hadDoiFallbackCandidate: false,
            });
        });

        it("accepts a slower iCite response that still completes within the larger PubMed budget", async () => {
            vi.useFakeTimers();

            const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
                const url = typeof input === "string" ? input : input.toString();
                if (url.includes("esummary.fcgi")) {
                    return jsonResponse({
                        result: {
                            "88990011": {
                                title: "Slow but successful enrichment",
                                authors: [{ name: "Budget B" }],
                                pubdate: "2026",
                                fulljournalname: "Latency Journal",
                                articleids: [],
                            },
                        },
                    });
                }
                if (url.includes("icite.od.nih.gov/api/pubs/88990011")) {
                    return new Promise<Response>((resolve) => {
                        setTimeout(() => {
                            resolve(jsonResponse({
                                citation_count: 29,
                            }));
                        }, 1000);
                    });
                }
                throw new Error(`Unexpected URL: ${url}`);
            });
            vi.stubGlobal("fetch", fetchMock);

            const resultPromise = resolveCitationMetadataCached("https://pubmed.ncbi.nlm.nih.gov/88990011/");
            await vi.advanceTimersByTimeAsync(1000);
            const result = await resultPromise;

            expect(result?.metadata).toMatchObject({
                title: "Slow but successful enrichment",
                pmid: "88990011",
                citationCount: 29,
                citationCountSource: "icite",
            });
            expect(result?.diagnostics).toMatchObject({
                resolutionPath: "pubmed_icite",
                reason: "count_resolved",
                resolvedWithCitationCount: true,
                hadDoiFallbackCandidate: false,
            });
        });

        it("returns classified DOI metadata with a citation count when Crossref resolves safely", async () => {
            const fetchMock = vi.fn().mockResolvedValue(
                jsonResponse({
                    message: {
                        title: ["DOI classified success"],
                        author: [{ family: "Doe", given: "Jane" }],
                        "container-title": ["Crossref Journal"],
                        created: { "date-parts": [[2024]] },
                        "is-referenced-by-count": 23,
                    },
                }),
            );
            vi.stubGlobal("fetch", fetchMock);

            const result = await resolveCitationMetadataCached("https://doi.org/10.1000/classified-success");

            expect(result?.metadata).toMatchObject({
                title: "DOI classified success",
                doi: "10.1000/classified-success",
                citationCount: 23,
                citationCountSource: "crossref",
            });
            expect(result?.diagnostics).toMatchObject({
                resolutionPath: "doi_crossref",
                reason: "count_resolved",
                resolvedWithCitationCount: true,
                hadDoiFallbackCandidate: false,
            });
        });

        it("keeps a classified DOI no-count result stable on cache hits", async () => {
            const fetchMock = vi.fn().mockResolvedValue(
                jsonResponse({
                    message: {
                        title: ["Cached DOI no-count"],
                        author: [{ family: "Smith", given: "Alex" }],
                        "container-title": ["Stable Journal"],
                        created: { "date-parts": [[2025]] },
                    },
                }),
            );
            vi.stubGlobal("fetch", fetchMock);

            const first = await resolveCitationMetadataCached("https://doi.org/10.1000/cache-stable");
            const second = await resolveCitationMetadataCached("https://doi.org/10.1000/cache-stable");

            expect(first).toEqual(second);
            expect(second?.diagnostics).toMatchObject({
                resolutionPath: "doi_no_count",
                reason: "crossref_no_count",
                resolvedWithCitationCount: false,
                hadDoiFallbackCandidate: false,
            });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it("returns null for DOI timeouts when Crossref never yields safe metadata", async () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";

            const fetchMock = vi.fn().mockRejectedValue(abortError);
            vi.stubGlobal("fetch", fetchMock);

            const result = await resolveCitationMetadataCached("https://doi.org/10.1000/timeout");
            expect(result).toBeNull();
        });

        it("returns null for DOI provider errors when Crossref never yields safe metadata", async () => {
            const fetchMock = vi.fn().mockRejectedValue(new Error("crossref down"));
            vi.stubGlobal("fetch", fetchMock);

            const result = await resolveCitationMetadataCached("https://doi.org/10.1000/provider-error");
            expect(result).toBeNull();
        });
    });

    describe("fetchCrossrefMetadata", () => {
        it("maps journal and citation count fields when available", async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    message: {
                        title: ["Citation rich paper"],
                        author: [{ family: "Smith", given: "Jane" }],
                        "container-title": ["Journal of Testing"],
                        "published-online": { "date-parts": [[2025, 1, 2]] },
                        "is-referenced-by-count": 345,
                    },
                }),
            } as Response);
            vi.stubGlobal("fetch", fetchMock);

            const result = await fetchCrossrefMetadata("10.1000/xyz123");
            expect(result).not.toBeNull();
            expect(result?.journal).toBe("Journal of Testing");
            expect(result?.citationCount).toBe(345);
            expect(result?.citationCountSource).toBe("crossref");
            expect(typeof result?.citationCountFetchedAt).toBe("string");
        });
    });
});
