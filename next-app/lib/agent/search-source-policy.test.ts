import { describe, expect, it } from "vitest";
import {
    deriveSearchSourcePolicy,
    filterSearchToolsByPolicy,
    isSearchToolAllowedBySourcePolicy,
} from "@/lib/agent/search-source-policy";

describe("search source policy", () => {
    it("defaults to PubMed only", () => {
        const policy = deriveSearchSourcePolicy("find RCTs about metformin");

        expect(policy).toEqual({
            allowPubMed: true,
            allowOpenAlex: false,
            allowSemanticScholar: false,
        });
        expect(isSearchToolAllowedBySourcePolicy("search_pubmed", policy)).toBe(true);
        expect(isSearchToolAllowedBySourcePolicy("search_openalex", policy)).toBe(false);
        expect(isSearchToolAllowedBySourcePolicy("search_semantic_scholar", policy)).toBe(false);
    });

    it("allows OpenAlex only when named explicitly", () => {
        const policy = deriveSearchSourcePolicy("Search OpenAlex for digital triage studies");

        expect(policy.allowOpenAlex).toBe(true);
        expect(policy.allowSemanticScholar).toBe(false);
    });

    it("allows Semantic Scholar only when named explicitly", () => {
        const policy = deriveSearchSourcePolicy("Use Semantic Scholar for citation-network discovery");

        expect(policy.allowSemanticScholar).toBe(true);
        expect(policy.allowOpenAlex).toBe(false);
    });

    it("does not treat bare biomedical S2 wording as Semantic Scholar permission", () => {
        const policy = deriveSearchSourcePolicy("search S2 heart sound studies in older adults");

        expect(policy.allowPubMed).toBe(true);
        expect(policy.allowSemanticScholar).toBe(false);
        expect(policy.allowOpenAlex).toBe(false);
    });

    it("allows explicit S2 API/source wording for Semantic Scholar", () => {
        const policy = deriveSearchSourcePolicy("use the S2 API for citation-network discovery");

        expect(policy.allowSemanticScholar).toBe(true);
        expect(policy.allowOpenAlex).toBe(false);
    });

    it("does not treat broad-source language as non-PubMed permission", () => {
        const policy = deriveSearchSourcePolicy("search everywhere across broad interdisciplinary literature");

        expect(policy.allowPubMed).toBe(true);
        expect(policy.allowOpenAlex).toBe(false);
        expect(policy.allowSemanticScholar).toBe(false);
    });

    it("respects explicit tool names from an approved plan", () => {
        const policy = deriveSearchSourcePolicy({
            text: "execute the approved plan",
            explicitToolNames: ["search_openalex"],
        });

        expect(policy.allowOpenAlex).toBe(true);
        expect(policy.allowSemanticScholar).toBe(false);
    });

    it("respects recommendation tools from an approved Semantic Scholar plan", () => {
        const policy = deriveSearchSourcePolicy({
            text: "execute the approved plan",
            explicitToolNames: ["recommend_studies"],
        });

        expect(policy.allowSemanticScholar).toBe(true);
        expect(policy.allowOpenAlex).toBe(false);
    });

    it("filters only gated search tools", () => {
        const policy = deriveSearchSourcePolicy("find diabetes studies");
        const tools = [
            { name: "search_pubmed" },
            { name: "search_openalex" },
            { name: "search_semantic_scholar" },
            { name: "recommend_studies" },
            { name: "read_protocol" },
        ];

        expect(filterSearchToolsByPolicy(tools, policy).map((tool) => tool.name)).toEqual([
            "search_pubmed",
            "read_protocol",
        ]);
    });
});
