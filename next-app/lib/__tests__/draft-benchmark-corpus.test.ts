import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { draftBenchmarkImportFixtures, draftBenchmarkManuscriptFixtures } from "@/lib/draft-benchmark/corpus";
import { resolveDraftBenchmarkSourcePath, summarizeDraftBenchmarkCorpus, summarizeManuscriptFixture } from "@/lib/draft-benchmark/harness";

describe("draft benchmark corpus", () => {
  it("ships the expected manuscript fixtures with strong coverage", () => {
    expect(draftBenchmarkManuscriptFixtures.map((fixture) => fixture.id)).toEqual([
      "short-paper",
      "medium-review",
      "large-evidence-heavy",
      "object-heavy",
      "metadata-heavy",
    ]);

    const summary = summarizeDraftBenchmarkCorpus();
    expect(summary.manuscripts).toHaveLength(5);

    const largeFixture = summary.manuscripts.find((fixture) => fixture.id === "large-evidence-heavy");
    expect(largeFixture?.wordCount ?? 0).toBeGreaterThan(500);
    expect(largeFixture?.citationCount ?? 0).toBeGreaterThanOrEqual(35);

    const objectFixture = summary.manuscripts.find((fixture) => fixture.id === "object-heavy");
    expect(objectFixture?.nodeTypes.figure).toBeGreaterThanOrEqual(1);
    expect(objectFixture?.nodeTypes.table).toBeGreaterThanOrEqual(1);
    expect(objectFixture?.nodeTypes.equation).toBeGreaterThanOrEqual(1);
  });

  it("keeps each manuscript fixture above its declared minimum thresholds", () => {
    for (const fixture of draftBenchmarkManuscriptFixtures) {
      const summary = summarizeManuscriptFixture(fixture);
      expect(summary.sectionCount).toBeGreaterThanOrEqual(fixture.expected.minimumSectionCount);
      expect(summary.citationCount).toBeGreaterThanOrEqual(fixture.expected.minimumCitationCount);
      for (const nodeType of fixture.expected.requiredNodeTypes) {
        expect(summary.nodeTypes[nodeType] ?? 0).toBeGreaterThan(0);
      }
      expect(summary.exportReferenceCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("points every import fixture at a concrete source artifact", () => {
    expect(draftBenchmarkImportFixtures).toHaveLength(9);
    for (const fixture of draftBenchmarkImportFixtures) {
      const absolutePath = resolveDraftBenchmarkSourcePath(fixture.sourcePath);
      expect(fs.existsSync(absolutePath)).toBe(true);
      expect(fs.statSync(absolutePath).size).toBeGreaterThan(0);
    }
  });
});
