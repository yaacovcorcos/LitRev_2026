#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BUDGET_PATH = "../output/performance/baseline/budget-thresholds.json";
const DEFAULT_BASELINE_PATH = "../output/performance/baseline/baseline-latest.json";
const DEFAULT_RESULTS_PATH = "../output/performance/results/results-latest.json";
const DEFAULT_WAIVERS_PATH = "../output/performance/baseline/waivers.json";
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
    waivers: path.resolve(cwd, DEFAULT_WAIVERS_PATH),
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
    if (key === "waivers" && next) args.waivers = path.resolve(cwd, next);
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
    waivers,
  },
  artifactRoots = DEFAULT_ARTIFACT_ROOTS,
) {
  validateArtifactLocation(budget, "budget", [artifactRoots.baselineRoot]);
  validateArtifactLocation(baseline, "baseline", [artifactRoots.baselineRoot, artifactRoots.resultsRoot]);
  validateArtifactLocation(results, "results", [artifactRoots.baselineRoot, artifactRoots.resultsRoot]);
  validateArtifactLocation(waivers, "waivers", [artifactRoots.baselineRoot]);
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

function createIssue({
  type,
  route,
  profile,
  message,
  metricName = null,
}) {
  return {
    type,
    route,
    profile,
    metricName,
    message,
  };
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
        issues.push(createIssue({
          type: "missing",
          route,
          profile,
          message: `[missing] ${route} ${profile}: no results entry`,
        }));
        continue;
      }

      const sampleCount = numberOrNull(resultEntry.samples) ?? 0;
      if (sampleCount < ciMinSamples) {
        issues.push(createIssue({
          type: "insufficient-sample",
          route,
          profile,
          message: `[insufficient-sample] ${route} ${profile}: samples=${sampleCount}, required=${ciMinSamples}`,
        }));
        continue;
      }

      const profileThreshold = thresholdsByProfile[profile];
      if (!profileThreshold) {
        issues.push(createIssue({
          type: "missing-threshold",
          route,
          profile,
          message: `[missing-threshold] ${route} ${profile}: no profile threshold configured`,
        }));
        continue;
      }

      for (const metricName of ["LCP", "INP", "CLS", "TTFB"]) {
        const p75 = getMetric(resultEntry.p75, metricName);
        const threshold = numberOrNull(profileThreshold[metricName]);
        if (p75 == null || threshold == null) {
          issues.push(createIssue({
            type: "missing-metric",
            route,
            profile,
            metricName,
            message: `[missing-metric] ${route} ${profile} ${metricName}: missing p75 or threshold`,
          }));
          continue;
        }

        if (p75 > threshold) {
          issues.push(createIssue({
            type: "threshold",
            route,
            profile,
            metricName,
            message: `[threshold] ${route} ${profile} ${metricName}: p75=${p75} exceeds threshold=${threshold}`,
          }));
        }

        const baselineP75 = getMetric(baselineEntry?.p75, metricName);
        if (baselineP75 != null && baselineP75 > 0) {
          const pct = ((p75 - baselineP75) / baselineP75) * 100;
          if (pct > regressionLimit) {
            issues.push(createIssue({
              type: "regression",
              route,
              profile,
              metricName,
              message: `[regression] ${route} ${profile} ${metricName}: +${pct.toFixed(2)}% exceeds limit=${regressionLimit}%`,
            }));
          }
        }
      }

      info.push(`[ok] ${route} ${profile}: samples=${sampleCount}`);
    }
  }

  return { issues, info };
}

function validateWaivers(waiverDocument, now = new Date()) {
  if (!waiverDocument || typeof waiverDocument !== "object") {
    throw new Error("[invalid-waivers] waivers file must be a JSON object");
  }

  const waivers = waiverDocument.waivers;
  if (!Array.isArray(waivers)) {
    throw new Error("[invalid-waivers] waivers file must contain a waivers array");
  }

  return waivers.map((waiver, index) => {
    if (!waiver || typeof waiver !== "object") {
      throw new Error(`[invalid-waivers] waiver ${index} must be an object`);
    }

    const normalized = {
      route: typeof waiver.route === "string" ? waiver.route.trim() : "",
      profile: typeof waiver.profile === "string" ? waiver.profile.trim() : "",
      metric: typeof waiver.metric === "string" ? waiver.metric.trim() : "",
      approver: typeof waiver.approver === "string" ? waiver.approver.trim() : "",
      reason: typeof waiver.reason === "string" ? waiver.reason.trim() : "",
      expiresAt: typeof waiver.expiresAt === "string" ? waiver.expiresAt.trim() : "",
      followUp: typeof waiver.followUp === "string" ? waiver.followUp.trim() : "",
    };

    for (const [key, value] of Object.entries(normalized)) {
      if (!value) {
        throw new Error(`[invalid-waivers] waiver ${index} is missing ${key}`);
      }
    }

    const expiresAt = new Date(normalized.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error(`[invalid-waivers] waiver ${index} has an invalid expiresAt value`);
    }

    if (expiresAt.getTime() <= now.getTime()) {
      throw new Error(
        `[expired-waiver] ${normalized.route} ${normalized.profile} ${normalized.metric}: expired ${normalized.expiresAt}`,
      );
    }

    return normalized;
  });
}

function applyWaivers(issues, waivers) {
  const activeIssues = [];
  const waivedMessages = [];

  for (const issue of issues) {
    if (issue.type !== "regression" || !issue.metricName) {
      activeIssues.push(issue);
      continue;
    }

    const matchingWaiver = waivers.find((waiver) => (
      waiver.route === issue.route
      && waiver.profile === issue.profile
      && waiver.metric === issue.metricName
    ));

    if (!matchingWaiver) {
      activeIssues.push(issue);
      continue;
    }

    waivedMessages.push(
      `[waived] ${issue.message} (approver=${matchingWaiver.approver}; expiresAt=${matchingWaiver.expiresAt}; followUp=${matchingWaiver.followUp})`,
    );
  }

  return {
    activeIssues,
    waivedMessages,
  };
}

export function runBudgetCheck(argv = process.argv, options = {}) {
  const {
    cwd = process.cwd(),
    stdout = console.log,
    stderr = console.error,
    artifactRoots = DEFAULT_ARTIFACT_ROOTS,
    now = new Date(),
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
  let waiversDocument;

  try {
    budget = readJson(args.budget, "budget");
    baseline = readJson(args.baseline, "baseline");
    results = readJson(args.results, "results");
    waiversDocument = readJson(args.waivers, "waivers");
  } catch (error) {
    stderr(`[perf-budget-check] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  let waivers;
  try {
    waivers = validateWaivers(waiversDocument, now);
  } catch (error) {
    stderr(`[perf-budget-check] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const { issues, info } = compareResults({ budget, baseline, results });
  const { activeIssues, waivedMessages } = applyWaivers(issues, waivers);

  stdout(`[perf-budget-check] mode=${args.mode}`);
  for (const line of info) {
    stdout(line);
  }
  for (const line of waivedMessages) {
    stdout(line);
  }

  if (activeIssues.length === 0) {
    stdout("[perf-budget-check] pass");
    return 0;
  }

  stdout("[perf-budget-check] violations:");
  for (const issue of activeIssues) {
    stdout(` - ${issue.message}`);
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
