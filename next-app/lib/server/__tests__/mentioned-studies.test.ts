import { describe, expect, it } from "vitest";
import {
    extractMentionedStudies,
    normalizeDoi,
    normalizePmid,
    stripMentionedStudiesMarkup,
} from "@/lib/ai/mentioned-studies";

describe("mentioned-studies parsing", () => {
    it("normalizes DOI and PMID inputs", () => {
        expect(normalizeDoi("https://doi.org/10.1000/ABC.123,")).toBe("10.1000/abc.123");
        expect(normalizePmid("PMID: 12345678")).toBe("12345678");
    });

    it("extracts structured mentioned studies from hidden comment", () => {
        const text = `Summary\n<!-- MENTIONED_STUDIES: {"studies":[{"title":"Study A","year":2024,"doi":"10.1000/a"},{"title":"Study B","pmid":"12345678"}]} -->`;
        const studies = extractMentionedStudies(text);

        expect(studies).toHaveLength(2);
        expect(studies[0]?.doi).toBe("10.1000/a");
        expect(studies[1]?.pmid).toBe("12345678");
    });

    it("falls back to markdown links and dedupes by DOI", () => {
        const text = [
            '[Turner et al. 2016](https://doi.org/10.1097/j.pain.0000000000000635)',
            'DOI again: 10.1097/J.PAIN.0000000000000635',
        ].join("\n");

        const studies = extractMentionedStudies(text);
        expect(studies).toHaveLength(1);
        expect(studies[0]?.doi).toBe("10.1097/j.pain.0000000000000635");
        expect(studies[0]?.title).toContain("Turner");
    });

    it("extracts PMID from pubmed links", () => {
        const text = "See https://pubmed.ncbi.nlm.nih.gov/40010103/ for details.";
        const studies = extractMentionedStudies(text);
        expect(studies).toHaveLength(1);
        expect(studies[0]?.pmid).toBe("40010103");
    });

    it("extracts quoted title-year mentions", () => {
        const text = 'Classic: "Mindfulness for Chronic Pain" (2022) as a landmark synthesis.';
        const studies = extractMentionedStudies(text);
        expect(studies).toHaveLength(1);
        expect(studies[0]?.title).toBe("Mindfulness for Chronic Pain");
        expect(studies[0]?.year).toBe(2022);
    });

    it("supports long quoted title-year mentions", () => {
        const longTitle = "A".repeat(260);
        const text = `Classic: "${longTitle}" (2021) with extended naming.`;
        const studies = extractMentionedStudies(text);
        expect(studies).toHaveLength(1);
        expect(studies[0]?.title).toBe(longTitle);
        expect(studies[0]?.year).toBe(2021);
    });

    it("strips mentioned-studies hidden markup from visible text", () => {
        const text = 'Narrative\n\n<!-- MENTIONED_STUDIES: {"studies":[]} -->';
        expect(stripMentionedStudiesMarkup(text)).toBe("Narrative");
    });

    it("strips fenced mentioned-studies blocks from visible text", () => {
        const text = 'Narrative\n\n```mentioned_studies\n{"studies":[]}\n```';
        expect(stripMentionedStudiesMarkup(text)).toBe("Narrative");
    });

    it("derives clickable sourceUrl from DOI when missing", () => {
        const text = '<mentioned_studies>{"studies":[{"title":"Study A","doi":"10.1000/a"}]}</mentioned_studies>';
        const studies = extractMentionedStudies(text);
        expect(studies[0]?.sourceUrl).toBe("https://doi.org/10.1000/a");
    });
});
