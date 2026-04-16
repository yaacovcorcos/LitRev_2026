import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBibliographyByFormat } from "@/lib/draft-import/bibliography";
import { mergeAuxiliaryBibliography } from "@/lib/draft-import/bibliography/normalize";
import type { Study } from "@/types/ledger";

const FIXTURE_DIR = path.join(process.cwd(), "test", "fixtures", "draft", "imports", "source");

const studies: Study[] = [
  {
    id: "study-1",
    title: "Synthetic Outcomes After Timed Intensification",
    authors: "Smith, Jane, Brown, Alex",
    year: 2020,
    status: "active",
    quality: "High",
    details: { doi: "10.1000/litrev-benchmark-1" },
  },
  {
    id: "study-2",
    title: "Benchmark Comparator Effects Across Care Settings",
    authors: "Jones, Priya",
    year: 2021,
    status: "active",
    quality: "High",
    details: { doi: "10.1000/litrev-benchmark-2" },
  },
];

function fixture(name: string) {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

describe("bibliography import adapters", () => {
  it.each([
    ["csl-json", "sample-references.csl.json"],
    ["ris", "sample-references.ris"],
    ["bibtex", "sample-references.bib"],
  ] as const)("parses %s fixtures into linked auxiliary references", (format, filename) => {
    const references = parseBibliographyByFormat(format, fixture(filename), studies);

    expect(references).toHaveLength(2);
    expect(references.map((reference) => reference.title)).toEqual([
      "Benchmark Comparator Effects Across Care Settings",
      "Synthetic Outcomes After Timed Intensification",
    ]);
    expect(references.every((reference) => reference.linkedStudyId)).toBe(true);
  });

  it("deduplicates bibliography merges by scholarly identity", () => {
    const cslReferences = parseBibliographyByFormat("csl-json", fixture("sample-references.csl.json"), studies);
    const bibtexReferences = parseBibliographyByFormat("bibtex", fixture("sample-references.bib"), studies);

    const merged = mergeAuxiliaryBibliography(cslReferences, bibtexReferences);

    expect(merged).toHaveLength(2);
    expect(merged.every((reference) => reference.linkedStudyId)).toBe(true);
  });
});
