import { describe, expect, it } from "vitest";
import {
    extractDoi,
    extractPmid,
    getCitationType,
    normalizeDoi,
    resolveCitationKey,
} from "@/lib/citation-key";

describe("citation key utilities", () => {
    describe("normalizeDoi", () => {
        it("removes doi URL prefixes and lowercases", () => {
            expect(normalizeDoi("https://doi.org/10.1000/XYZ123")).toBe("10.1000/xyz123");
            expect(normalizeDoi("https://dx.doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
            expect(normalizeDoi("http://doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
        });

        it("trims whitespace", () => {
            expect(normalizeDoi(" 10.1000/xyz123 ")).toBe("10.1000/xyz123");
        });
    });

    describe("extractPmid", () => {
        it("extracts PMID from canonical PubMed URLs", () => {
            expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/12345678/")).toBe("12345678");
            expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/12345678")).toBe("12345678");
            expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/12345678/?foo=bar")).toBe("12345678");
        });

        it("returns null for non-pubmed URLs", () => {
            expect(extractPmid("https://example.com/12345678")).toBeNull();
            expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/search/")).toBeNull();
        });
    });

    describe("extractDoi", () => {
        it("extracts DOI from canonical DOI URLs", () => {
            expect(extractDoi("https://doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
            expect(extractDoi("https://dx.doi.org/10.1016/j.cell.2023.01.001")).toBe(
                "10.1016/j.cell.2023.01.001"
            );
        });

        it("returns null for non-doi URLs", () => {
            expect(extractDoi("https://example.com/10.1000/xyz123")).toBeNull();
            expect(extractDoi("https://doi.org/invalid")).toBeNull();
        });

        it("returns null for malformed DOI URL encoding", () => {
            expect(extractDoi("https://doi.org/10.1000/%ZZ")).toBeNull();
            expect(extractDoi("https://doi.org/10.1000/%")).toBeNull();
        });
    });

    describe("getCitationType", () => {
        it("detects DOI and PubMed hosts", () => {
            expect(getCitationType("https://doi.org/10.1000/xyz123")).toBe("DOI");
            expect(getCitationType("https://pubmed.ncbi.nlm.nih.gov/12345678/")).toBe("PubMed");
        });

        it("returns null for non-citation links", () => {
            expect(getCitationType("https://example.com/path")).toBeNull();
        });
    });

    describe("resolveCitationKey", () => {
        it("normalizes DOI cache keys", () => {
            expect(resolveCitationKey("https://doi.org/10.1000/XYZ123")).toEqual({
                cacheKey: "doi:10.1000/xyz123",
                type: "DOI",
                doi: "10.1000/xyz123",
            });
        });

        it("builds PMID cache keys", () => {
            expect(resolveCitationKey("https://pubmed.ncbi.nlm.nih.gov/12345678/")).toEqual({
                cacheKey: "pmid:12345678",
                type: "PubMed",
                pmid: "12345678",
            });
        });

        it("returns null for unsupported links", () => {
            expect(resolveCitationKey("https://example.com")).toBeNull();
        });
    });
});
