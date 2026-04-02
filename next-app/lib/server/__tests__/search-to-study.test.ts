import { describe, it, expect } from "vitest";
import {
  hasConcreteSearchResultYear,
  searchResultToStudyInput,
} from "@/lib/server/search/to-study";
import type { SearchResult } from "@/types/search";

describe("searchResultToStudyInput", () => {
  it("maps all fields correctly", () => {
    const result: SearchResult = {
      pmid: "12345678",
      doi: "10.1234/test.001",
      title: "Test Study Title",
      authors: "Smith J, Doe A",
      year: 2024,
      journal: "J Test Med",
      volume: "45",
      issue: "3",
      pages: "100-110",
      abstract: "This is the abstract.",
      keywords: ["Randomized Controlled Trial", "Statins"],
      source: "pubmed",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
    };

    expect(hasConcreteSearchResultYear(result)).toBe(true);
    if (!hasConcreteSearchResultYear(result)) throw new Error("Expected year");
    const input = searchResultToStudyInput(result);

    expect(input.title).toBe("Test Study Title");
    expect(input.authors).toBe("Smith J, Doe A");
    expect(input.year).toBe(2024);
    expect(input.status).toBe("pending");
    expect(input.quality).toBe("-");

    expect(input.details?.source).toBe("pubmed");
    expect(input.details?.doi).toBe("10.1234/test.001");
    expect(input.details?.pmid).toBe("12345678");
    expect(input.details?.journal).toBe("J Test Med");
    expect(input.details?.volume).toBe("45");
    expect(input.details?.issue).toBe("3");
    expect(input.details?.pages).toBe("100-110");
    expect(input.details?.sourceUrl).toBe("https://pubmed.ncbi.nlm.nih.gov/12345678/");
    expect(input.details?.abstract).toBe("This is the abstract.");
    expect(input.details?.keywords).toEqual(["Randomized Controlled Trial", "Statins"]);
  });

  it("handles minimal result with defaults", () => {
    const result: SearchResult = {
      title: "Minimal Study",
      authors: "Unknown",
      year: 2025,
      source: "pubmed",
    };

    expect(hasConcreteSearchResultYear(result)).toBe(true);
    if (!hasConcreteSearchResultYear(result)) throw new Error("Expected year");
    const input = searchResultToStudyInput(result);

    expect(input.title).toBe("Minimal Study");
    expect(input.authors).toBe("Unknown");
    expect(input.year).toBe(2025);
    expect(input.status).toBe("pending");
    expect(input.quality).toBe("-");
    expect(input.details?.source).toBe("pubmed");
    expect(input.details?.doi).toBeUndefined();
    expect(input.details?.pmid).toBeUndefined();
    expect(input.details?.abstract).toBeUndefined();
    expect(input.details?.keywords).toBeUndefined();
  });

  it("does not include empty keywords array", () => {
    const result: SearchResult = {
      title: "No Keywords",
      authors: "Test A",
      year: 2024,
      source: "pubmed",
      keywords: [],
    };

    expect(hasConcreteSearchResultYear(result)).toBe(true);
    if (!hasConcreteSearchResultYear(result)) throw new Error("Expected year");
    const input = searchResultToStudyInput(result);
    expect(input.details?.keywords).toBeUndefined();
  });

  it("returns false from the year guard when year is missing", () => {
    const result: SearchResult = {
      title: "Unknown Year Study",
      authors: "Test A",
      source: "pubmed",
    };

    expect(hasConcreteSearchResultYear(result)).toBe(false);
  });

  it("returns false from the year guard for non-finite year values", () => {
    const nanYear: SearchResult = {
      title: "NaN Year Study",
      authors: "Test A",
      year: Number.NaN,
      source: "pubmed",
    };
    const infinityYear: SearchResult = {
      title: "Infinity Year Study",
      authors: "Test B",
      year: Number.POSITIVE_INFINITY,
      source: "pubmed",
    };

    expect(hasConcreteSearchResultYear(nanYear)).toBe(false);
    expect(hasConcreteSearchResultYear(infinityYear)).toBe(false);
  });

  it("preserves OpenAlex provenance when converting a search result to a ledger study", () => {
    const result: SearchResult = {
      title: "OpenAlex Study",
      authors: "Researcher A",
      year: 2024,
      source: "openalex",
      sourceUrl: "https://openalex.org/W123",
    };

    expect(hasConcreteSearchResultYear(result)).toBe(true);
    if (!hasConcreteSearchResultYear(result)) throw new Error("Expected year");
    const input = searchResultToStudyInput(result);

    expect(input.details?.source).toBe("openalex");
    expect(input.details?.sourceUrl).toBe("https://openalex.org/W123");
  });
});
