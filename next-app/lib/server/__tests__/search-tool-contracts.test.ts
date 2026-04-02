import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/search/pubmed", () => ({
    searchPubMed: vi.fn(),
}));

vi.mock("@/lib/server/search/openalex", () => ({
    searchOpenAlex: vi.fn(),
}));

vi.mock("@/lib/server/search/semantic-scholar", () => ({
    searchSemanticScholar: vi.fn(),
}));

vi.mock("@/lib/server/logging", () => ({
    logServerWarn: vi.fn(),
}));

import { executeTool } from "@/lib/server/ai/tools/base";
import { searchPubMed } from "@/lib/server/search/pubmed";
import { searchOpenAlex } from "@/lib/server/search/openalex";
import { searchSemanticScholar } from "@/lib/server/search/semantic-scholar";
import { logServerWarn } from "@/lib/server/logging";

describe("search tool output contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("accepts a yearless PubMed result at the tool boundary", async () => {
        vi.mocked(searchPubMed).mockResolvedValueOnce({
            query: "yearless pubmed",
            source: "pubmed",
            totalResults: 1,
            returnedCount: 1,
            results: [
                {
                    title: "PubMed Yearless Result",
                    authors: "Author A",
                    source: "pubmed",
                },
            ],
        });

        const result = await executeTool("search_pubmed", { query: "yearless pubmed" }, "call-1");

        expect(result.error).toBeUndefined();
        expect(result.result).toMatchObject({
            returnedCount: 1,
            results: [
                {
                    title: "PubMed Yearless Result",
                    authors: "Author A",
                },
            ],
        });
        expect((result.result as { results: Array<{ year?: number }> }).results[0]?.year).toBeUndefined();
        expect(logServerWarn).not.toHaveBeenCalled();
    });

    it("accepts a yearless OpenAlex result at the tool boundary", async () => {
        vi.mocked(searchOpenAlex).mockResolvedValueOnce({
            query: "yearless openalex",
            source: "openalex",
            totalResults: 1,
            returnedCount: 1,
            results: [
                {
                    title: "OpenAlex Yearless Result",
                    authors: "Author B",
                    source: "openalex",
                },
            ],
        });

        const result = await executeTool("search_openalex", { query: "yearless openalex" }, "call-2");

        expect(result.error).toBeUndefined();
        expect(result.result).toMatchObject({
            returnedCount: 1,
            results: [
                {
                    title: "OpenAlex Yearless Result",
                    authors: "Author B",
                },
            ],
        });
        expect((result.result as { results: Array<{ year?: number }> }).results[0]?.year).toBeUndefined();
        expect(logServerWarn).not.toHaveBeenCalled();
    });

    it("accepts a yearless Semantic Scholar result at the tool boundary", async () => {
        vi.mocked(searchSemanticScholar).mockResolvedValueOnce({
            query: "yearless semantic scholar",
            source: "semantic-scholar",
            totalResults: 1,
            returnedCount: 1,
            results: [
                {
                    title: "Semantic Scholar Yearless Result",
                    authors: "Author C",
                    source: "semantic-scholar",
                },
            ],
        });

        const result = await executeTool("search_semantic_scholar", { query: "yearless semantic scholar" }, "call-3");

        expect(result.error).toBeUndefined();
        expect(result.result).toMatchObject({
            returnedCount: 1,
            results: [
                {
                    title: "Semantic Scholar Yearless Result",
                    authors: "Author C",
                },
            ],
        });
        expect((result.result as { results: Array<{ year?: number }> }).results[0]?.year).toBeUndefined();
        expect(logServerWarn).not.toHaveBeenCalled();
    });
});
