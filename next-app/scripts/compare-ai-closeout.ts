import fs from "node:fs";
import path from "node:path";

import {
  AI_CLOSEOUT_THRESHOLDS,
  evaluateAiCloseout,
  type AiCaptureReport,
} from "../lib/ai-closeout-metrics";

type Args = {
  baselinePath: string;
  headPath: string;
};

function parseArgs(argv: string[]): Args {
  let baselinePath = "";
  let headPath = "";

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [key, inlineValue] = token.slice(2).split("=");
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue == null && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      index += 1;
    }

    if (key === "baseline" && value) baselinePath = path.resolve(value);
    if (key === "head" && value) headPath = path.resolve(value);
  }

  if (!baselinePath || !headPath) {
    throw new Error("Usage: tsx scripts/compare-ai-closeout.ts --baseline <path> --head <path>");
  }

  return { baselinePath, headPath };
}

function readReport(filePath: string): AiCaptureReport {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as AiCaptureReport;
}

function formatMetric(label: string, baseline: number, head: number, delta: number, percentDelta: number) {
  return `${label}: ${baseline} -> ${head} (${delta >= 0 ? "-" : "+"}${Math.abs(delta)}; ${percentDelta >= 0 ? "-" : "+"}${Math.abs(percentDelta).toFixed(1)}%)`;
}

function main() {
  const args = parseArgs(process.argv);
  const baseline = readReport(args.baselinePath);
  const head = readReport(args.headPath);
  const evaluation = evaluateAiCloseout(baseline, head, AI_CLOSEOUT_THRESHOLDS);

  console.log(`Baseline: ${baseline.commit} (${baseline.label})`);
  console.log(`Head: ${head.commit} (${head.label})`);
  console.log(formatMetric(
    "Bundle bytes",
    evaluation.bundleBytes.baseline,
    evaluation.bundleBytes.head,
    evaluation.bundleBytes.delta,
    evaluation.bundleBytes.percentDelta,
  ));
  console.log(formatMetric(
    "Composer ready (empty)",
    evaluation.composerReadyMs.baseline,
    evaluation.composerReadyMs.head,
    evaluation.composerReadyMs.delta,
    evaluation.composerReadyMs.percentDelta,
  ));
  console.log(formatMetric(
    "Timeline ready (populated)",
    evaluation.timelineReadyMs.baseline,
    evaluation.timelineReadyMs.head,
    evaluation.timelineReadyMs.delta,
    evaluation.timelineReadyMs.percentDelta,
  ));
  console.log(`Closeout: ${evaluation.passed ? "PASS" : "FAIL"}`);
}

main();
