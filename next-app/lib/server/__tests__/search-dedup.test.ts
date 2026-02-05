import { describe, it, expect } from "vitest";
import { findDuplicates } from "@/lib/server/search/dedup";
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
    expect(duplicates[0].title).toBe("Duplicate");
    expect(unique).toHaveLength(1);
    expect(unique[0].title).toBe("Unique");
  });

  it("detects DOI duplicates (case-insensitive)", () => {
    const existing = [
      makeStudy({ id: "s1", details: { doi: "10.1234/test.001" } }),
    ];
    const results = [
      makeResult({ doi: "10.1234/TEST.001", title: "Duplicate" }),
      makeResult({ doi: "10.5678/other.002", title: "Unique" }),
    ];

    const { unique, duplicates } = findDuplicates(existing, results);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].title).toBe("Duplicate");
    expect(unique).toHaveLength(1);
  });

  it("returns all results as unique when no existing studies", () => {
    const results = [
      makeResult({ pmid: "111" }),
      makeResult({ pmid: "222" }),
    ];

    const { unique, duplicates } = findDuplicates([], results);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it("returns all results as duplicates when all match", () => {
    const existing = [
      makeStudy({ id: "s1", details: { pmid: "111" } }),
      makeStudy({ id: "s2", details: { pmid: "222" } }),
    ];
    const results = [
      makeResult({ pmid: "111" }),
      makeResult({ pmid: "222" }),
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
});
