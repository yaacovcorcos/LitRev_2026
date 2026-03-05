#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    mode: "warn",
    budget: path.resolve(process.cwd(), "../output/performance/baseline/budget-thresholds.json"),
    baseline: path.resolve(process.cwd(), "../output/performance/baseline/baseline-latest.json"),
    results: path.resolve(process.cwd(), "../output/performance/baseline/baseline-latest.json"),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const [rawKey, rawVal] = value.slice(2).split("=");
    const key = rawKey;
    const next = rawVal ?? argv[i + 1];
    if (rawVal == null && argv[i + 1] && !argv[i + 1].startsWith("--")) i += 1;
    if (key === "mode" && next) args.mode = next;
    if (key === "budget" && next) args.budget = path.resolve(process.cwd(), next);
    if (key === "baseline" && next) args.baseline = path.resolve(process.cwd(), next);
    if (key === "results" && next) args.results = path.resolve(process.cwd(), next);
  }
  return args;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
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

function main() {
  const args = parseArgs(process.argv);
  const budget = readJson(args.budget);
  const baseline = readJson(args.baseline);
  const results = readJson(args.results);

  const { issues, info } = compareResults({ budget, baseline, results });

  console.log("[perf-budget-check] mode=", args.mode);
  for (const line of info) {
    console.log(line);
  }

  if (issues.length === 0) {
    console.log("[perf-budget-check] pass");
    process.exit(0);
  }

  console.log("[perf-budget-check] violations:");
  for (const line of issues) {
    console.log(` - ${line}`);
  }

  if (args.mode === "enforce") {
    process.exit(1);
  }

  process.exit(0);
}

main();
