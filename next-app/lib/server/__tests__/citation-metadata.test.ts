import { describe, expect, it } from "vitest";
import {
    normalizeDoi,
    extractPmid,
    extractDoi,
} from "../citation-metadata";

describe("citation-metadata utilities", () => {
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
});
