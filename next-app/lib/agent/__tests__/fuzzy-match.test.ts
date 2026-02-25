import { describe, expect, it } from "vitest";
import {
  findBestFuzzyListMatch,
  fuzzyMatch,
  normalizeUnicodeForFuzzyMatch,
} from "@/lib/agent/fuzzy-match";

describe("fuzzy-match", () => {
  it("matches exact text on pass 1", () => {
    const result = fuzzyMatch("alpha beta gamma", "beta");
    expect(result).toEqual({ index: 6, pass: 1 });
  });

  it("matches on pass 2 when trailing whitespace differs", () => {
    const haystack = "line one   \nline two\t";
    const needle = "line one\nline two";
    const result = fuzzyMatch(haystack, needle);
    expect(result?.pass).toBe(2);
  });

  it("matches on pass 3 when line-leading whitespace differs", () => {
    const haystack = "  inclusion criterion\n  adults over 18";
    const needle = "inclusion criterion\nadults over 18";
    const result = fuzzyMatch(haystack, needle);
    expect(result?.pass).toBe(3);
  });

  it("matches on pass 4 when unicode punctuation differs", () => {
    const haystack = "Adults\u00A0over\u00A018 \u2014 randomized\u2026";
    const needle = "Adults over 18 - randomized...";
    const result = fuzzyMatch(haystack, needle);
    expect(result?.pass).toBe(4);
  });

  it("normalizes smart punctuation and NBSP", () => {
    const normalized = normalizeUnicodeForFuzzyMatch("“quoted” text\u00A0with\u2014dash");
    expect(normalized).toBe("\"quoted\" text with-dash");
  });

  it("finds fuzzy list matches with pass metadata", () => {
    const result = findBestFuzzyListMatch(
      ["Case reports", "Adults\u00A0over\u00A018\u2014years"],
      "Adults over 18-years"
    );
    expect(result).toBeTruthy();
    expect(result?.index).toBe(1);
    expect(result?.pass).toBe(4);
  });

  it("returns null when no candidate is close enough", () => {
    const result = findBestFuzzyListMatch(["RCT only", "Adults"], "Mouse models only");
    expect(result).toBeNull();
  });
});
