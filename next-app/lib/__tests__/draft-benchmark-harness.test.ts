import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { draftBenchmarkManuscriptFixtures } from "@/lib/draft-benchmark/corpus";
import { evaluateDraftBenchmarkMeasurements, resolveDraftBenchmarkSourcePath, summarizeDraftBenchmarkGate } from "@/lib/draft-benchmark/harness";
import { renderDocxExport } from "@/lib/draft-export/render-docx";
import { compileDraftExportDocument } from "@/lib/draft-export/compile";
import { moveTopLevelBlock, reorderManuscriptSection } from "@/lib/manuscript/workspace";

describe("draft benchmark harness", () => {
  it("preserves anchorable block ids through block moves and section reorders", () => {
    const fixture = draftBenchmarkManuscriptFixtures.find((entry) => entry.id === "medium-review");
    expect(fixture).toBeTruthy();
    if (!fixture) return;

    const beforeSections = fixture.snapshot.manuscript.sections.map((section) => section.sectionId);
    const resultsSection = fixture.snapshot.manuscript.doc.content?.find(
      (node) => node.type === "manuscriptSection" && node.attrs?.sectionId === "results",
    );
    const movedBlockId = resultsSection?.content?.find((node) => node.type === "paragraph")?.attrs?.blockId;
    expect(typeof movedBlockId).toBe("string");

    const reordered = reorderManuscriptSection({
      document: fixture.snapshot.manuscript,
      sectionId: "discussion",
      targetSectionId: "methods",
      position: "before",
    });

    const moved = moveTopLevelBlock(reordered, {
      sectionId: "results",
      blockId: String(movedBlockId),
      direction: "down",
    });

    const afterSections = moved.sections.map((section) => section.sectionId);
    expect(beforeSections).toContain("discussion");
    expect(afterSections.indexOf("discussion")).toBeLessThan(afterSections.indexOf("methods"));

    const movedBlockStillPresent = JSON.stringify(moved.doc).includes(String(movedBlockId));
    expect(movedBlockStillPresent).toBe(true);
  });

  it("renders the short-paper fixture through the DOCX export pipeline", async () => {
    const fixture = draftBenchmarkManuscriptFixtures.find((entry) => entry.id === "short-paper");
    expect(fixture).toBeTruthy();
    if (!fixture) return;

    const compiled = compileDraftExportDocument({
      projectTitle: fixture.label,
      draftSnapshot: fixture.snapshot,
      studies: fixture.studies,
    });
    expect(compiled.references.length).toBeGreaterThanOrEqual(1);

    const bytes = await renderDocxExport(compiled);
    expect(Buffer.from(bytes).subarray(0, 2).toString()).toBe("PK");
  });

  it("evaluates measurement gates against the benchmark budgets", () => {
    const results = evaluateDraftBenchmarkMeasurements([
      { metric: "coldOpenMs", scale: "short", value: 1000, fixtureId: "short-paper" },
      { metric: "typingLatencyMs", scale: "large", value: 58, fixtureId: "large-evidence-heavy" },
      { metric: "anchorStabilityRate", value: 0.998 },
      { metric: "browserSmokeFailureCount", value: 0 },
    ]);

    const gate = summarizeDraftBenchmarkGate(results);
    expect(gate.passed).toBe(true);
    expect(gate.blockingFailures).toHaveLength(0);

    const failingGate = summarizeDraftBenchmarkGate(
      evaluateDraftBenchmarkMeasurements([
        { metric: "typingLatencyMs", scale: "large", value: 91, fixtureId: "large-evidence-heavy" },
        { metric: "recoverSuccessRate", value: 0.97 },
      ]),
    );
    expect(failingGate.passed).toBe(false);
    expect(failingGate.blockingFailures.map((entry) => entry.metric)).toEqual([
      "typingLatencyMs",
      "recoverSuccessRate",
    ]);
  });

  it("keeps the generated DOCX import source as a valid zip container", () => {
    const absolutePath = resolveDraftBenchmarkSourcePath("test/fixtures/draft/imports/source/sample-manuscript.docx");
    const bytes = fs.readFileSync(absolutePath);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });
});
