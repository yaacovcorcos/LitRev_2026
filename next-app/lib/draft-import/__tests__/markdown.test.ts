import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMarkdownManuscript } from "@/lib/draft-import/manuscript/markdown";
import type { DraftAuxiliaryReference } from "@/lib/draft-import/types";

const FIXTURE_PATH = path.join(process.cwd(), "test", "fixtures", "draft", "imports", "source", "sample-manuscript.md");
const markdownFixture = readFileSync(FIXTURE_PATH, "utf8");

const linkedBibliography: DraftAuxiliaryReference[] = [
  {
    id: "aux-smith",
    sourceFormat: "bibtex",
    sourceItemId: "smith2020",
    citationKey: "smith2020",
    title: "Synthetic Outcomes After Timed Intensification",
    doi: "10.1000/litrev-benchmark-1",
    linkedStudyId: "study-1",
  },
  {
    id: "aux-jones",
    sourceFormat: "bibtex",
    sourceItemId: "jones2021",
    citationKey: "jones2021",
    title: "Benchmark Comparator Effects Across Care Settings",
    doi: "10.1000/litrev-benchmark-2",
    linkedStudyId: "study-2",
  },
];

describe("parseMarkdownManuscript", () => {
  it("preserves sections and resolves cite keys through linked auxiliary bibliography", () => {
    const result = parseMarkdownManuscript(markdownFixture, {
      sourceFormat: "markdown",
      sourceLabel: "sample-manuscript.md",
      auxiliaryBibliography: linkedBibliography,
    });

    expect(result.title).toBe("Synthetic Benchmark Manuscript");
    expect(result.sections.map((section) => section.label)).toEqual(["Background", "Methods", "Results"]);
    expect(result.summary.preserved).toContain("table structure");
    expect(result.summary.unresolved).not.toContain("pandoc-style cite keys");

    const backgroundParagraph = result.sections[0]?.blocks[0];
    expect(backgroundParagraph?.type).toBe("paragraph");
    const hasCitation = result.sections
      .flatMap((section) => section.blocks)
      .some((block) => JSON.stringify(block).includes('"type":"citation"'));
    expect(hasCitation).toBe(true);
  });

  it("downgrades unresolved cite keys into explicit text markers", () => {
    const result = parseMarkdownManuscript(markdownFixture, {
      sourceFormat: "markdown",
      sourceLabel: "sample-manuscript.md",
      auxiliaryBibliography: [],
    });

    expect(result.summary.downgraded).toContain("citation syntax to unresolved external references");
    expect(result.summary.unresolved).toContain("pandoc-style cite keys");
    expect(result.report.some((entry) => entry.code === "import.citation.unresolved_key")).toBe(true);
  });
});
