import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDraftImportPayload } from "@/lib/draft-import";
import { draftBenchmarkImportFixtures } from "@/lib/draft-benchmark/corpus";
import type { Study } from "@/types/ledger";

const studies: Study[] = [
  {
    id: "study-1",
    title: "Synthetic Outcomes After Timed Intensification",
    authors: "Smith, Jane",
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

function readFixture(format: string, sourcePath: string) {
  const absolute = path.join(process.cwd(), sourcePath);
  if (format === "docx") {
    return { bytes: new Uint8Array(readFileSync(absolute)) };
  }
  return { text: readFileSync(absolute, "utf8") };
}

describe("draft import fixtures", () => {
  it("parses every committed DAP-00 import fixture with truthful summary coverage", async () => {
    for (const fixture of draftBenchmarkImportFixtures) {
      const result = await parseDraftImportPayload(
        {
          format: fixture.format,
          filename: path.basename(fixture.sourcePath),
          ...readFixture(fixture.format, fixture.sourcePath),
        },
        {
          sourceLabel: fixture.label,
          studies,
          auxiliaryBibliography: [],
        },
      );

      for (const expected of fixture.expectedReport.preserved) {
        expect(result.summary.preserved).toContain(expected);
      }
      for (const expected of fixture.expectedReport.downgraded) {
        expect(result.summary.downgraded).toContain(expected);
      }
      for (const expected of fixture.expectedReport.unresolved) {
        expect(result.summary.unresolved).toContain(expected);
      }
    }
  });
});
