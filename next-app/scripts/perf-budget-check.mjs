#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BUDGET_PATH = "../output/performance/baseline/budget-thresholds.json";
const DEFAULT_BASELINE_PATH = "../output/performance/baseline/baseline-latest.json";
const DEFAULT_RESULTS_PATH = "../output/performance/results/results-latest.json";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_ARTIFACT_ROOTS = {
  baselineRoot: path.resolve(REPO_ROOT, "output", "performance", "baseline"),
  resultsRoot: path.resolve(REPO_ROOT, "output", "performance", "results"),
};

export function parseArgs(argv, cwd = process.cwd()) {
  const args = {
    mode: "warn",
    budget: path.resolve(cwd, DEFAULT_BUDGET_PATH),
    baseline: path.resolve(cwd, DEFAULT_BASELINE_PATH),
    results: path.resolve(cwd, DEFAULT_RESULTS_PATH),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const [rawKey, rawVal] = value.slice(2).split("=");
    const key = rawKey;
    const next = rawVal ?? argv[i + 1];
    if (rawVal == null && argv[i + 1] && !argv[i + 1].startsWith("--")) i += 1;
    if (key === "mode" && next) args.mode = next;
    if (key === "budget" && next) args.budget = path.resolve(cwd, next);
    if (key === "baseline" && next) args.baseline = path.resolve(cwd, next);
    if (key === "results" && next) args.results = path.resolve(cwd, next);
  }
  return args;
}

function canonicalizeFilePath(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.normalize(filePath);
  }
}

function isWithinRoot(filePath, allowedRoot) {
  const normalizedPath = path.resolve(filePath);
  const normalizedRoot = path.resolve(allowedRoot);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${path.sep}`);
}

function validateArtifactLocation(filePath, label, allowedRoots) {
  if (allowedRoots.some((allowedRoot) => isWithinRoot(filePath, allowedRoot))) {
    return;
  }

  throw new Error(`[invalid-${label}-path] ${filePath}: must stay within ${allowedRoots.join(" or ")}`);
}

function readJson(filePath, label) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`[invalid-${label}] ${filePath}: ${error.message}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`[invalid-${label}]`)) {
      throw error;
    }
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`[missing-${label}] ${filePath}: file not found`);
    }
    throw new Error(`[read-${label}] ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateArtifactPaths(
  {
    budget,
    baseline,
    results,
  },
  artifactRoots = DEFAULT_ARTIFACT_ROOTS,
) {
  validateArtifactLocation(budget, "budget", [artifactRoots.baselineRoot]);
  validateArtifactLocation(baseline, "baseline", [artifactRoots.baselineRoot, artifactRoots.resultsRoot]);
  validateArtifactLocation(results, "results", [artifactRoots.baselineRoot, artifactRoots.resultsRoot]);
  if (canonicalizeFilePath(baseline) === canonicalizeFilePath(results)) {
    throw new Error(`[same-path] baseline and results resolve to the same file: ${baseline}`);
  }
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getMetric(metrics, metricName) {
  if (!metrics || typeof metrics !== "object") return null;
  return numberOrNull(metrics[metricName]);
}

function compareResults({ budget, baseline, results }) {
  const issues = [];
  const info = [];

  const thresholdsByProfile = budget.thresholds ?? {};
  const regressionLimit = typeof budget.allowedRegressionPercent === "number"
    ? budget.allowedRegressionPercent
    : 10;

  const ciMinSamples = numberOrNull(
    budget.samples?.ci?.minRunsPerRouteProfile,
  ) ?? 9;

  for (const route of budget.mandatoryRoutes ?? []) {
    for (const profile of budget.mandatoryProfiles ?? []) {
      const resultEntry = results.routes?.[route]?.[profile];
      const baselineEntry = baseline.routes?.[route]?.[profile];
      if (!resultEntry) {
        issues.push(`[missing] ${route} ${profile}: no results entry`);
        continue;
      }

      const sampleCount = numberOrNull(resultEntry.samples) ?? 0;
      if (sampleCount < ciMinSamples) {
        issues.push(`[insufficient-sample] ${route} ${profile}: samples=${sampleCount}, required=${ciMinSamples}`);
        continue;
      }

      const profileThreshold = thresholdsByProfile[profile];
      if (!profileThreshold) {
        issues.push(`[missing-threshold] ${route} ${profile}: no profile threshold configured`);
        continue;
      }

      for (const metricName of ["LCP", "INP", "CLS", "TTFB"]) {
        const p75 = getMetric(resultEntry.p75, metricName);
        const threshold = numberOrNull(profileThreshold[metricName]);
        if (p75 == null || threshold == null) {
          issues.push(`[missing-metric] ${route} ${profile} ${metricName}: missing p75 or threshold`);
          continue;
        }

        if (p75 > threshold) {
          issues.push(`[threshold] ${route} ${profile} ${metricName}: p75=${p75} exceeds threshold=${threshold}`);
        }

        const baselineP75 = getMetric(baselineEntry?.p75, metricName);
        if (baselineP75 != null && baselineP75 > 0) {
          const pct = ((p75 - baselineP75) / baselineP75) * 100;
          if (pct > regressionLimit) {
            issues.push(`[regression] ${route} ${profile} ${metricName}: +${pct.toFixed(2)}% exceeds limit=${regressionLimit}%`);
          }
        }
      }

      info.push(`[ok] ${route} ${profile}: samples=${sampleCount}`);
    }
  }

  return { issues, info };
}

export function runBudgetCheck(argv = process.argv, options = {}) {
  const {
    cwd = process.cwd(),
    stdout = console.log,
    stderr = console.error,
    artifactRoots = DEFAULT_ARTIFACT_ROOTS,
  } = options;

  let args;
  try {
    args = parseArgs(argv, cwd);
    validateArtifactPaths(args, artifactRoots);
  } catch (error) {
    stderr(`[perf-budget-check] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  let budget;
  let baseline;
  let results;

  try {
    budget = readJson(args.budget, "budget");
    baseline = readJson(args.baseline, "baseline");
    results = readJson(args.results, "results");
  } catch (error) {
    stderr(`[perf-budget-check] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const { issues, info } = compareResults({ budget, baseline, results });

  stdout(`[perf-budget-check] mode=${args.mode}`);
  for (const line of info) {
    stdout(line);
  }

  if (issues.length === 0) {
    stdout("[perf-budget-check] pass");
    return 0;
  }

  stdout("[perf-budget-check] violations:");
  for (const line of issues) {
    stdout(` - ${line}`);
  }

  if (args.mode === "enforce") {
    return 1;
  }

  return 0;
}

export function main() {
  process.exit(runBudgetCheck(process.argv));
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main();
}
