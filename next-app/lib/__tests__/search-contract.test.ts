import { describe, expect, it } from "vitest";
import {
  formatSearchCountDetail,
  formatSearchMagnitudeDeltaSentence,
  formatSearchMagnitudeSentence,
  formatSearchSummary,
  getSearchMagnitude,
  parseOpaqueOffsetCursor,
} from "@/lib/search-contract";

describe("search-contract", () => {
  it("formats returned-versus-total count text truthfully", () => {
    expect(formatSearchCountDetail({ returnedCount: 5, totalResults: 18 })).toBe("5 of 18 results");
    expect(formatSearchCountDetail({ returnedCount: 5 })).toBe("Returned 5 results");
    expect(formatSearchCountDetail({ totalResults: 18 })).toBe("18 total results");
    expect(formatSearchCountDetail({})).toBeNull();
  });

  it("formats search summaries from the same count contract", () => {
    expect(formatSearchSummary("PubMed", { returnedCount: 5, totalResults: 18 })).toBe(
      "Found 5 of 18 PubMed results.",
    );
    expect(formatSearchSummary("OpenAlex", { returnedCount: 5 })).toBe(
      "Returned 5 OpenAlex results.",
    );
    expect(formatSearchSummary("PubMed", { totalResults: 18 })).toBe(
      "Found 18 PubMed results.",
    );
  });

  it("tracks whether a search size came from total results or returned results", () => {
    expect(getSearchMagnitude({ returnedCount: 5, totalResults: 18 })).toEqual({
      value: 18,
      basis: "total",
    });
    expect(getSearchMagnitude({ returnedCount: 5 })).toEqual({
      value: 5,
      basis: "returned",
    });
    expect(getSearchMagnitude({})).toBeNull();
  });

  it("describes total-result and returned-result magnitudes differently", () => {
    expect(formatSearchMagnitudeSentence("PubMed", { value: 42, basis: "total" })).toBe(
      "PubMed found 42 total results",
    );
    expect(formatSearchMagnitudeSentence("PubMed", { value: 10, basis: "returned" })).toBe(
      "PubMed returned 10 results",
    );
    expect(
      formatSearchMagnitudeDeltaSentence(
        "PubMed",
        { value: 42, basis: "total" },
        { value: 9, basis: "total" },
      ),
    ).toBe("The latest PubMed search narrowed the total result set from 42 to 9 results.");
    expect(
      formatSearchMagnitudeDeltaSentence(
        "PubMed",
        { value: 10, basis: "returned" },
        { value: 4, basis: "returned" },
      ),
    ).toBe("The latest PubMed search narrowed the returned result page from 10 to 4 results.");
    expect(
      formatSearchMagnitudeDeltaSentence(
        "PubMed",
        { value: 42, basis: "total" },
        { value: 4, basis: "returned" },
      ),
    ).toBeNull();
  });

  it("accepts only non-negative integer continuation tokens for offset-style cursors", () => {
    expect(parseOpaqueOffsetCursor("0", "PubMed")).toBe(0);
    expect(parseOpaqueOffsetCursor("25", "Semantic Scholar")).toBe(25);
    expect(() => parseOpaqueOffsetCursor("", "PubMed")).toThrow(
      "PubMed cursor must be a non-negative integer continuation token.",
    );
    expect(() => parseOpaqueOffsetCursor("abc", "PubMed")).toThrow(
      "PubMed cursor must be a non-negative integer continuation token.",
    );
    expect(() => parseOpaqueOffsetCursor("-1", "PubMed")).toThrow(
      "PubMed cursor must be a non-negative integer continuation token.",
    );
  });
});
