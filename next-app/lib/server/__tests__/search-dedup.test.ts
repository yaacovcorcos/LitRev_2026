import { describe, it, expect } from "vitest";
import { buildStudyDuplicateClusters, findDuplicates } from "@/lib/server/search/dedup";
import type { SearchResult } from "@/types/search";
import type { Study } from "@/types/ledger";

function makeStudy(overrides: Partial<Study> = {}): Study {
  return {
    id: "study-1",
    title: "Test Study",
    authors: "Smith J",
    year: 2024,
    status: "pending",
    quality: "-",
    ...overrides,
  };
}

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: "Search Result",
    authors: "Doe A",
    year: 2024,
    source: "pubmed",
    ...overrides,
  };
}

describe("findDuplicates", () => {
  it("detects PMID duplicates", () => {
    const existing = [
      makeStudy({ id: "s1", details: { pmid: "12345678" } }),
    ];
    const results = [
      makeResult({ pmid: "12345678", title: "Duplicate" }),
      makeResult({ pmid: "99999999", title: "Unique" }),
    ];

    const { unique, duplicates } = findDuplicates(existing, results);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].result.title).toBe("Duplicate");
    expect(duplicates[0].matchedBy).toBe("pmid");
    expect(duplicates[0].existingStudyId).toBe("s1");
    expect(duplicates[0].existingTitle).toBe("Test Study");
    expect(unique).toHaveLength(1);
    expect(unique[0].title).toBe("Unique");
  });

  it("detects DOI duplicates (case-insensitive, normalized url/prefix)", () => {
    const existing = [
      makeStudy({ id: "s1", details: { doi: "https://doi.org/10.1234/test.001" } }),
    ];
    const results = [
      makeResult({ doi: "DOI:10.1234/TEST.001", title: "Duplicate" }),
      makeResult({ doi: "10.5678/other.002", title: "Unique" }),
    ];

    const { unique, duplicates } = findDuplicates(existing, results);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].result.title).toBe("Duplicate");
    expect(duplicates[0].matchedBy).toBe("doi");
    expect(unique).toHaveLength(1);
  });

  it("returns all results as unique when no existing studies", () => {
    const results = [
      makeResult({ pmid: "111111", title: "Unique A" }),
      makeResult({ pmid: "222222", title: "Unique B" }),
    ];

    const { unique, duplicates } = findDuplicates([], results);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it("returns all results as duplicates when all match", () => {
    const existing = [
      makeStudy({ id: "s1", details: { pmid: "111111" } }),
      makeStudy({ id: "s2", details: { pmid: "222222" } }),
    ];
    const results = [
      makeResult({ pmid: "111111", title: "First Duplicate" }),
      makeResult({ pmid: "222222", title: "Second Duplicate" }),
    ];

    const { unique, duplicates } = findDuplicates(existing, results);
    expect(unique).toHaveLength(0);
    expect(duplicates).toHaveLength(2);
  });

  it("handles studies without details", () => {
    const existing = [
      makeStudy({ id: "s1" }), // no details
    ];
    const results = [
      makeResult({ pmid: "111" }),
    ];

    const { unique, duplicates } = findDuplicates(existing, results);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(0);
  });

  it("handles results without identifiers", () => {
    const existing = [
      makeStudy({ id: "s1", details: { pmid: "111" } }),
    ];
    const results = [
      makeResult({ title: "No IDs" }), // no pmid, no doi
    ];

    const { unique, duplicates } = findDuplicates(existing, results);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(0);
  });

  it("detects title+year duplicates with normalized punctuation/case", () => {
    const existing = [
      makeStudy({
        id: "s1",
        title: "Effect of Sleep Intervention on Glucose Control",
        authors: "Jane Smith, John Doe",
        year: 2024,
      }),
    ];
    const results = [
      makeResult({
        title: "Effect-of sleep intervention: on glucose control!",
        authors: "J Smith, Coauthor",
        year: 2024,
      }),
    ];

    const { unique, duplicates } = findDuplicates(existing, results);
    expect(unique).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].matchedBy).toBe("titleYear");
    expect(duplicates[0].existingStudyId).toBe("s1");
  });

  it("does not mark title+year duplicates when first-author token conflicts", () => {
    const existing = [
      makeStudy({
        id: "s1",
        title: "Vitamin D and Sleep Outcomes",
        authors: "Smith J, Doe A",
        year: 2022,
      }),
    ];
    const results = [
      makeResult({
        title: "Vitamin D and Sleep Outcomes",
        authors: "Garcia M, Lin T",
        year: 2022,
      }),
    ];

    const { unique, duplicates } = findDuplicates(existing, results);
    expect(duplicates).toHaveLength(0);
    expect(unique).toHaveLength(1);
  });

  it("deduplicates repeated items within the same incoming batch", () => {
    const results = [
      makeResult({
        doi: "10.1111/test.1",
        title: "Study A",
      }),
      makeResult({
        doi: "https://doi.org/10.1111/test.1",
        title: "Study A Duplicate",
      }),
    ];

    const { unique, duplicates } = findDuplicates([], results);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].matchedBy).toBe("doi");
  });
});

describe("buildStudyDuplicateClusters", () => {
  it("builds transitive high-confidence clusters for identifier matches", () => {
    const studies: Study[] = [
      makeStudy({
        id: "s1",
        title: "A",
        details: { doi: "10.1111/demo.1" },
      }),
      makeStudy({
        id: "s2",
        title: "B",
        details: { doi: "https://doi.org/10.1111/demo.1", pmid: "123456" },
      }),
      makeStudy({
        id: "s3",
        title: "C",
        details: { pmid: "123456" },
      }),
      makeStudy({
        id: "s4",
        title: "D",
        details: { doi: "10.2222/other.1" },
      }),
    ];

    const clusters = buildStudyDuplicateClusters(studies);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].studyIds).toEqual(["s1", "s2", "s3"]);
    expect(clusters[0].confidence).toBe("high");
    expect(clusters[0].signals).toEqual(expect.arrayContaining(["doi", "pmid"]));
  });

  it("returns medium-confidence title/year clusters when identifiers are missing", () => {
    const studies: Study[] = [
      makeStudy({
        id: "s1",
        title: "Effect of Omega 3 on Sleep",
        authors: "Smith, J",
        year: 2020,
      }),
      makeStudy({
        id: "s2",
        title: "effect of omega-3 on sleep",
        authors: "J Smith",
        year: 2020,
      }),
      makeStudy({
        id: "s3",
        title: "Completely Different Study",
        authors: "Doe A",
        year: 2020,
      }),
    ];

    const clusters = buildStudyDuplicateClusters(studies);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].confidence).toBe("medium");
    expect(clusters[0].signals).toContain("titleYearAuthor");
    expect(clusters[0].studyIds).toEqual(["s1", "s2"]);
  });
});
