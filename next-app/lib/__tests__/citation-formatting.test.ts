import { describe, expect, it } from "vitest";
import { formatBibliographyEntries } from "@/lib/citation-formatting";
import type { Study } from "@/types/ledger";

const studies: Study[] = [
  {
    id: "study-1",
    title: "Study One",
    authors: "Smith J, Doe A",
    year: 2020,
    status: "active",
    quality: "High",
    details: {
      journal: "Journal A",
      volume: "10",
      issue: "2",
      pages: "1-5",
      doi: "10.1000/a",
    },
  },
  {
    id: "study-2",
    title: "Study Two",
    authors: "Jones R",
    year: 2021,
    status: "active",
    quality: "Medium",
    details: {
      journal: "Journal B",
      volume: "4",
      pages: "10-12",
    },
  },
];

describe("formatBibliographyEntries", () => {
  it("formats Vancouver-style bibliography entries in the provided order", () => {
    const entries = formatBibliographyEntries({
      orderedStudyIds: ["study-2", "study-1"],
      studies,
    });

    expect(entries.map((entry) => entry.studyId)).toEqual(["study-2", "study-1"]);
    expect(entries[0]?.text).toMatch(/^1\./);
    expect(entries[0]?.text).toContain("Study Two");
    expect(entries[1]?.text).toMatch(/^2\./);
    expect(entries[1]?.text).toContain("Study One");
  });

  it("produces a stable placeholder when a cited study is missing", () => {
    const entries = formatBibliographyEntries({
      orderedStudyIds: ["missing-study"],
      studies: [],
    });

    expect(entries).toEqual([
      {
        studyId: "missing-study",
        number: 1,
        text: "1. Missing study metadata for missing-study.",
        missingStudy: true,
      },
    ]);
  });
});
