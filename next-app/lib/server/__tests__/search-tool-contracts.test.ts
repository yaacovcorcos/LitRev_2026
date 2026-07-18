import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/search/pubmed", () => ({
    searchPubMed: vi.fn(),
}));

vi.mock("@/lib/server/search/openalex", () => ({
    searchOpenAlex: vi.fn(),
}));

vi.mock("@/lib/server/search/semantic-scholar", () => ({
    searchSemanticScholar: vi.fn(),
    getRecommendations: vi.fn(),
    buildS2PaperIds: vi.fn(),
}));

vi.mock("@/lib/server/ledger", () => ({
    listStudies: vi.fn(),
}));

vi.mock("@/lib/server/logging", () => ({
    logServerWarn: vi.fn(),
}));

import { executeTool } from "@/lib/server/ai/tools/base";
import { searchPubMed } from "@/lib/server/search/pubmed";
import { searchOpenAlex } from "@/lib/server/search/openalex";
import { buildS2PaperIds, getRecommendations, searchSemanticScholar } from "@/lib/server/search/semantic-scholar";
import { listStudies } from "@/lib/server/ledger";
import { logServerWarn } from "@/lib/server/logging";

function upstreamRateLimit(provider: string): Error & {
    status: number;
    headers: Record<string, string>;
} {
    return Object.assign(new Error(`${provider} rate limit exceeded`), {
        status: 429,
        headers: { "retry-after": "2" },
    });
}

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

    it("accepts a PubMed continuation cursor at the tool boundary", async () => {
        vi.mocked(searchPubMed).mockResolvedValueOnce({
            query: "continued pubmed",
            source: "pubmed",
            totalResults: 30,
            returnedCount: 10,
            results: [],
            nextCursor: "20",
        });

        const result = await executeTool(
            "search_pubmed",
            { query: "continued pubmed", maxResults: 10, cursor: "10" },
            "call-cursor-1",
        );

        expect(result.error).toBeUndefined();
        expect(searchPubMed).toHaveBeenCalledWith("continued pubmed", {
            maxResults: 10,
            cursor: "10",
        });
        expect(result.result).toMatchObject({
            returnedCount: 10,
            nextCursor: "20",
        });
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

    it("accepts a Semantic Scholar continuation cursor at the tool boundary", async () => {
        vi.mocked(searchSemanticScholar).mockResolvedValueOnce({
            query: "continued semantic scholar",
            source: "semantic-scholar",
            returnedCount: 10,
            results: [],
            nextCursor: "20",
        });

        const result = await executeTool(
            "search_semantic_scholar",
            { query: "continued semantic scholar", maxResults: 10, cursor: "10", yearRange: "2020-2024" },
            "call-cursor-2",
        );

        expect(result.error).toBeUndefined();
        expect(searchSemanticScholar).toHaveBeenCalledWith("continued semantic scholar", {
            maxResults: 10,
            cursor: "10",
            yearRange: "2020-2024",
        });
        expect(result.result).toMatchObject({
            returnedCount: 10,
            nextCursor: "20",
        });
    });

    it("accepts yearless recommendation results at the tool boundary", async () => {
        vi.mocked(listStudies).mockResolvedValueOnce([
            {
                id: "study-1",
                title: "Seed Study",
                authors: "Author Seed",
                year: 2024,
                status: "pending",
                quality: "-",
                details: {
                    triageDecision: "keep",
                    doi: "10.1000/seed",
                },
            },
        ]);
        vi.mocked(buildS2PaperIds)
            .mockReturnValueOnce(["DOI:10.1000/seed"])
            .mockReturnValueOnce([]);
        vi.mocked(getRecommendations).mockResolvedValueOnce([
            {
                title: "Yearless Recommendation",
                authors: "Author D",
                source: "semantic-scholar",
            },
        ]);

        const result = await executeTool(
            "recommend_studies",
            { limit: 1 },
            "call-4",
            { projectId: "project-1" },
        );

        expect(result.error).toBeUndefined();
        expect(result.result).toMatchObject({
            returnedCount: 1,
            results: [
                {
                    title: "Yearless Recommendation",
                    authors: "Author D",
                },
            ],
        });
        expect((result.result as { results: Array<{ year?: number }> }).results[0]?.year).toBeUndefined();
        expect(logServerWarn).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: "search_pubmed",
            execute: () => executeTool("search_pubmed", { query: "limited" }, "call-limit-pubmed"),
            reject: () => vi.mocked(searchPubMed).mockRejectedValueOnce(upstreamRateLimit("PubMed")),
        },
        {
            name: "search_openalex",
            execute: () => executeTool("search_openalex", { query: "limited" }, "call-limit-openalex"),
            reject: () => vi.mocked(searchOpenAlex).mockRejectedValueOnce(upstreamRateLimit("OpenAlex")),
        },
        {
            name: "search_semantic_scholar",
            execute: () => executeTool("search_semantic_scholar", { query: "limited" }, "call-limit-s2"),
            reject: () => vi.mocked(searchSemanticScholar).mockRejectedValueOnce(upstreamRateLimit("Semantic Scholar")),
        },
    ])("preserves structured upstream failures from $name", async ({ execute, reject }) => {
        reject();

        const result = await execute();

        expect(result.errorMeta).toMatchObject({
            kind: "tool_execution",
            code: "TOOL_UPSTREAM_RATE_LIMITED",
            retryable: true,
            source: "tool_upstream",
            status: 429,
            headers: { "retry-after-ms": "2000" },
        });
    });

    it("preserves structured upstream failures from Semantic Scholar recommendations", async () => {
        vi.mocked(listStudies).mockResolvedValueOnce([{
            id: "study-limited",
            title: "Seed Study",
            authors: "Author Seed",
            year: 2024,
            status: "pending",
            quality: "-",
            details: { triageDecision: "keep", doi: "10.1000/limited" },
        }]);
        vi.mocked(buildS2PaperIds)
            .mockReturnValueOnce(["DOI:10.1000/limited"])
            .mockReturnValueOnce([]);
        vi.mocked(getRecommendations).mockRejectedValueOnce(upstreamRateLimit("Semantic Scholar"));

        const result = await executeTool(
            "recommend_studies",
            { limit: 1 },
            "call-limit-recommendations",
            { projectId: "project-1" },
        );

        expect(result.errorMeta).toMatchObject({
            code: "TOOL_UPSTREAM_RATE_LIMITED",
            retryable: true,
            status: 429,
            headers: { "retry-after-ms": "2000" },
        });
    });
});
