import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import {
  DRAFT_BENCHMARK_BLOCKING_METRICS,
  DRAFT_BENCHMARK_BUDGETS,
  type DraftBenchmarkBlockingSlice,
  type DraftBenchmarkMetric,
  type DraftBenchmarkScale,
} from "@/lib/draft-benchmark/budgets";
import {
  draftBenchmarkImportFixtures,
  draftBenchmarkManuscriptFixtures,
  type DraftBenchmarkImportFixture,
  type DraftBenchmarkManuscriptFixture,
} from "@/lib/draft-benchmark/corpus";
import { compileDraftExportDocument } from "@/lib/draft-export/compile";

export type DraftBenchmarkMeasurement = {
  metric: DraftBenchmarkMetric;
  value: number;
  scale?: DraftBenchmarkScale;
  fixtureId?: string;
};

export type DraftBenchmarkMeasurementResult = DraftBenchmarkMeasurement & {
  threshold: number;
  passed: boolean;
  unit: "ms" | "ratio" | "count";
  blockingFor: DraftBenchmarkBlockingSlice[];
};

export type DraftBenchmarkGateResult = {
  passed: boolean;
  blockingFailures: DraftBenchmarkMeasurementResult[];
  informationalFailures: DraftBenchmarkMeasurementResult[];
  passing: DraftBenchmarkMeasurementResult[];
};

export type DraftBenchmarkFixtureSummary = {
  id: string;
  label: string;
  scale: DraftBenchmarkScale;
  sectionCount: number;
  wordCount: number;
  citationCount: number;
  blockIdCount: number;
  exportReferenceCount: number;
  nodeTypes: Record<string, number>;
};

export type DraftBenchmarkImportSummary = {
  id: string;
  format: DraftBenchmarkImportFixture["format"];
  sourcePath: string;
  sourceExists: boolean;
  sourceBytes: number;
  preservedCount: number;
  downgradedCount: number;
  unresolvedCount: number;
};

function walkNode(node: JSONContent | undefined, visit: (node: JSONContent) => void) {
  if (!node) return;
  visit(node);
  for (const child of node.content ?? []) {
    walkNode(child, visit);
  }
}

function textFromNode(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  if (node.type === "citation") return "[citation]";
  return (node.content ?? []).map((child) => textFromNode(child)).join(" ");
}

function countWords(document: JSONContent): number {
  return textFromNode(document)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function countNodeTypes(document: JSONContent): Record<string, number> {
  const counts: Record<string, number> = {};
  walkNode(document, (node) => {
    counts[node.type ?? "unknown"] = (counts[node.type ?? "unknown"] ?? 0) + 1;
  });
  return counts;
}

function collectBlockIds(document: JSONContent): Set<string> {
  const blockIds = new Set<string>();
  walkNode(document, (node) => {
    const blockId = node.attrs?.blockId;
    if (typeof blockId === "string" && blockId.trim().length > 0) {
      blockIds.add(blockId);
    }
  });
  return blockIds;
}

export function resolveDraftBenchmarkSourcePath(sourcePath: string) {
  return path.join(process.cwd(), sourcePath);
}

export function summarizeManuscriptFixture(fixture: DraftBenchmarkManuscriptFixture): DraftBenchmarkFixtureSummary {
  const nodeTypes = countNodeTypes(fixture.snapshot.manuscript.doc);
  const exportDocument = compileDraftExportDocument({
    projectTitle: fixture.label,
    draftSnapshot: fixture.snapshot,
    studies: fixture.studies,
  });

  return {
    id: fixture.id,
    label: fixture.label,
    scale: fixture.scale,
    sectionCount: fixture.snapshot.manuscript.sections.length,
    wordCount: countWords(fixture.snapshot.manuscript.doc),
    citationCount: nodeTypes.citation ?? 0,
    blockIdCount: collectBlockIds(fixture.snapshot.manuscript.doc).size,
    exportReferenceCount: exportDocument.references.length,
    nodeTypes,
  };
}

export function summarizeImportFixture(fixture: DraftBenchmarkImportFixture): DraftBenchmarkImportSummary {
  const absolutePath = resolveDraftBenchmarkSourcePath(fixture.sourcePath);
  const sourceExists = fs.existsSync(absolutePath);
  const sourceBytes = sourceExists ? fs.statSync(absolutePath).size : 0;

  return {
    id: fixture.id,
    format: fixture.format,
    sourcePath: fixture.sourcePath,
    sourceExists,
    sourceBytes,
    preservedCount: fixture.expectedReport.preserved.length,
    downgradedCount: fixture.expectedReport.downgraded.length,
    unresolvedCount: fixture.expectedReport.unresolved.length,
  };
}

export function summarizeDraftBenchmarkCorpus() {
  return {
    manuscripts: draftBenchmarkManuscriptFixtures.map(summarizeManuscriptFixture),
    imports: draftBenchmarkImportFixtures.map(summarizeImportFixture),
    budgets: DRAFT_BENCHMARK_BUDGETS,
  };
}

function resolveThreshold(metric: DraftBenchmarkMetric, scale?: DraftBenchmarkScale): number {
  const budget = DRAFT_BENCHMARK_BUDGETS[metric];
  const threshold = (scale && budget.thresholds[scale]) ?? budget.thresholds.default;
  if (typeof threshold !== "number") {
    throw new Error(`No threshold defined for ${metric} (${scale ?? "default"}).`);
  }
  return threshold;
}

export function evaluateDraftBenchmarkMeasurements(
  measurements: DraftBenchmarkMeasurement[],
): DraftBenchmarkMeasurementResult[] {
  return measurements.map((measurement) => {
    const budget = DRAFT_BENCHMARK_BUDGETS[measurement.metric];
    const threshold = resolveThreshold(measurement.metric, measurement.scale);
    const passed = budget.direction === "max"
      ? measurement.value <= threshold
      : measurement.value >= threshold;

    return {
      ...measurement,
      threshold,
      passed,
      unit: budget.unit,
      blockingFor: budget.blockingFor,
    };
  });
}

export function summarizeDraftBenchmarkGate(results: DraftBenchmarkMeasurementResult[]): DraftBenchmarkGateResult {
  const blockingFailures = results.filter(
    (result) => !result.passed && DRAFT_BENCHMARK_BLOCKING_METRICS.includes(result.metric),
  );
  const informationalFailures = results.filter(
    (result) => !result.passed && !DRAFT_BENCHMARK_BLOCKING_METRICS.includes(result.metric),
  );
  const passing = results.filter((result) => result.passed);

  return {
    passed: blockingFailures.length === 0,
    blockingFailures,
    informationalFailures,
    passing,
  };
}
