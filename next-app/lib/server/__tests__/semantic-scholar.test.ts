import { describe, it, expect } from "vitest";
import { parseS2Paper, buildS2PaperIds, type S2Paper } from "@/lib/server/search/semantic-scholar";
import {
    hasConcreteSearchResultYear,
    searchResultToStudyInput,
} from "@/lib/server/search/to-study";
import { findDuplicates } from "@/lib/server/search/dedup";
import type { Study } from "@/types/ledger";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_PAPER: S2Paper = {
    paperId: "abc123def456",
    externalIds: {
        DOI: "10.1038/s41586-024-00001-x",
        PMID: "38000001",
        ArXiv: "2306.12345",
    },
    title: "Deep learning for protein structure prediction",
    abstract: "We present a method for predicting protein structures using deep learning.",
    year: 2024,
    authors: [
        { authorId: "100", name: "John Smith" },
        { authorId: "200", name: "Jane Doe" },
        { authorId: "300", name: "Wei Chen" },
    ],
    venue: "Nature",
    citationCount: 1500,
    influentialCitationCount: 120,
    isOpenAccess: true,
    fieldsOfStudy: ["Computer Science", "Biology"],
    publicationDate: "2024-03-15",
};

const MINIMAL_PAPER: S2Paper = {
    paperId: "xyz789",
    title: "A short note",
    year: 2023,
};

const DATE_ONLY_PAPER: S2Paper = {
    paperId: "dateonly1",
    title: "Paper with publicationDate only",
    publicationDate: "2022-07-01",
};

const NO_YEAR_PAPER: S2Paper = {
    paperId: "noyear1",
    title: "Paper with no year at all",
    abstract: null,
    year: null,
    authors: [],
    fieldsOfStudy: null,
};

// ── parseS2Paper ─────────────────────────────────────────────────────────────

describe("parseS2Paper", () => {
    it("parses fully populated paper with all fields", () => {
        const result = parseS2Paper(FULL_PAPER);

        expect(result.doi).toBe("10.1038/s41586-024-00001-x");
        expect(result.pmid).toBe("38000001");
        expect(result.title).toBe("Deep learning for protein structure prediction");
        expect(result.authors).toBe("John Smith, Jane Doe, Wei Chen");
        expect(result.year).toBe(2024);
        expect(result.journal).toBe("Nature");
        expect(result.abstract).toBe("We present a method for predicting protein structures using deep learning.");
        expect(result.keywords).toEqual(["Computer Science", "Biology"]);
        expect(result.source).toBe("semantic-scholar");
        expect(result.sourceUrl).toBe("https://www.semanticscholar.org/paper/abc123def456");

        // Metadata
        expect(result.metadata?.s2PaperId).toBe("abc123def456");
        expect(result.metadata?.citationCount).toBe(1500);
        expect(result.metadata?.influentialCitationCount).toBe(120);
        expect(result.metadata?.isOpenAccess).toBe(true);
        expect(result.metadata?.yearEstimated).toBeUndefined();
    });

    it("parses minimal paper with defaults", () => {
        const result = parseS2Paper(MINIMAL_PAPER);

        expect(result.title).toBe("A short note");
        expect(result.authors).toBe("Unknown");
        expect(result.year).toBe(2023);
        expect(result.doi).toBeUndefined();
        expect(result.pmid).toBeUndefined();
        expect(result.abstract).toBeUndefined();
        expect(result.keywords).toBeUndefined();
        expect(result.journal).toBeUndefined();
        expect(result.source).toBe("semantic-scholar");
        expect(result.metadata?.yearEstimated).toBeUndefined();
    });

    it("falls back to publicationDate for year when year is missing", () => {
        const result = parseS2Paper(DATE_ONLY_PAPER);
        expect(result.year).toBe(2022);
        expect(result.metadata?.yearEstimated).toBeUndefined();
    });

    it("falls back to current year and sets yearEstimated when no year at all", () => {
        const result = parseS2Paper(NO_YEAR_PAPER);
        expect(result.year).toBe(new Date().getFullYear());
        expect(result.metadata?.yearEstimated).toBe(true);
    });

    it("handles null abstract and empty authors gracefully", () => {
        const result = parseS2Paper(NO_YEAR_PAPER);
        expect(result.abstract).toBeUndefined();
        expect(result.authors).toBe("Unknown");
        expect(result.keywords).toBeUndefined();
    });

    it("always sets source to semantic-scholar", () => {
        expect(parseS2Paper(FULL_PAPER).source).toBe("semantic-scholar");
        expect(parseS2Paper(MINIMAL_PAPER).source).toBe("semantic-scholar");
        expect(parseS2Paper(NO_YEAR_PAPER).source).toBe("semantic-scholar");
    });
});

// ── buildS2PaperIds ──────────────────────────────────────────────────────────

function makeStudy(overrides: Partial<Study> & { details?: Record<string, unknown> }): Study {
    return {
        id: "s1",
        title: "Test",
        authors: "Author",
        year: 2024,
        status: "pending",
        quality: "-",
        ...overrides,
    };
}

describe("buildS2PaperIds", () => {
    it("prefers s2PaperId over DOI and PMID", () => {
        const studies = [makeStudy({ details: { s2PaperId: "abc", doi: "10.1/x", pmid: "111" } })];
        expect(buildS2PaperIds(studies)).toEqual(["abc"]);
    });

    it("falls back to DOI when no s2PaperId", () => {
        const studies = [makeStudy({ details: { doi: "10.2/y" } })];
        expect(buildS2PaperIds(studies)).toEqual(["DOI:10.2/y"]);
    });

    it("falls back to PMID when no s2PaperId or DOI", () => {
        const studies = [makeStudy({ details: { pmid: "222" } })];
        expect(buildS2PaperIds(studies)).toEqual(["PMID:222"]);
    });

    it("skips studies with no usable ID", () => {
        const studies = [makeStudy({ details: {} })];
        expect(buildS2PaperIds(studies)).toEqual([]);
    });

    it("handles mixed studies correctly", () => {
        const studies = [
            makeStudy({ id: "a", details: { s2PaperId: "s2id" } }),
            makeStudy({ id: "b", details: { doi: "10.3/z" } }),
            makeStudy({ id: "c", details: { pmid: "333" } }),
            makeStudy({ id: "d", details: {} }),
        ];
        expect(buildS2PaperIds(studies)).toEqual(["s2id", "DOI:10.3/z", "PMID:333"]);
    });
});

// ── Dedup e2e flow ───────────────────────────────────────────────────────────

describe("dedup e2e with S2 results", () => {
    it("detects duplicate via s2PaperId across search → study → dedup cycle", () => {
        // Step 1: Parse an S2 paper
        const searchResult = parseS2Paper(FULL_PAPER);

        // Step 2: Convert to study input
        expect(hasConcreteSearchResultYear(searchResult)).toBe(true);
        if (!hasConcreteSearchResultYear(searchResult)) throw new Error("Expected year");
        const studyInput = searchResultToStudyInput(searchResult);
        expect(studyInput.details?.s2PaperId).toBe("abc123def456");
        expect(studyInput.details?.source).toBe("semantic-scholar");

        // Step 3: Simulate existing study in ledger
        const existingStudy: Study = {
            id: "existing-1",
            title: studyInput.title,
            authors: studyInput.authors,
            year: studyInput.year,
            status: "pending",
            quality: "-",
            details: studyInput.details,
        };

        // Step 4: A subsequent search returns the same paper
        const duplicateResult = parseS2Paper(FULL_PAPER);

        // Step 5: Dedup should catch it
        const { unique, duplicates } = findDuplicates([existingStudy], [duplicateResult]);
        expect(duplicates).toHaveLength(1);
        expect(unique).toHaveLength(0);
    });

    it("detects duplicate via DOI when s2PaperId differs", () => {
        const existingStudy: Study = {
            id: "existing-2",
            title: "Some paper",
            authors: "Author",
            year: 2024,
            status: "pending",
            quality: "-",
            details: { doi: "10.1038/s41586-024-00001-x", source: "pubmed" },
        };

        // S2 result has same DOI but different s2PaperId
        const s2Result = parseS2Paper(FULL_PAPER);
        const { duplicates } = findDuplicates([existingStudy], [s2Result]);
        expect(duplicates).toHaveLength(1);
    });

    it("marks as unique when no identifiers match", () => {
        const existingStudy: Study = {
            id: "existing-3",
            title: "Different paper",
            authors: "Other Author",
            year: 2020,
            status: "pending",
            quality: "-",
            details: { doi: "10.9999/different", pmid: "99999999" },
        };

        const s2Result = parseS2Paper(FULL_PAPER);
        const { unique } = findDuplicates([existingStudy], [s2Result]);
        expect(unique).toHaveLength(1);
    });
});
