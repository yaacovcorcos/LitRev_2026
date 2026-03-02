import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    __clearCitationMetadataCacheForTests,
    fetchCrossrefMetadata,
    normalizeDoi,
    extractPmid,
    extractDoi,
    resolveCitationMetadataCached,
} from "../citation-metadata";

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
            expect(firstResult?.title).toBe("Concurrent metadata");
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
