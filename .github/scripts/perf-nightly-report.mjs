import fs from "node:fs";
import path from "node:path";

const TARGET_ROUTES = ["/", "/project/[id]/protocol", "/project/[id]/notes"];
const PROFILE = "slow-network";
const METRICS = ["LCP", "INP", "CLS", "TTFB"];

const REGRESSION_ABS_FLOOR = {
  LCP: 100,
  INP: 10,
  CLS: 0.01,
  TTFB: 50,
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(fullPath));
    if (entry.isFile()) out.push(fullPath);
  }
  return out;
}

function tryLoadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function hasTargetNightlyShape(data) {
  if (!data || typeof data !== "object" || !data.routes) return false;
  return TARGET_ROUTES.some((route) => Boolean(data.routes[route]?.[PROFILE]?.p75));
}

function findResultsJson(baseDir) {
  const files = walk(baseDir).filter((filePath) => filePath.endsWith(".json"));
  const preferred = files.find((filePath) => path.basename(filePath) === "results-nightly.json");
  if (preferred) return preferred;

  for (const filePath of files) {
    const data = tryLoadJson(filePath);
    if (hasTargetNightlyShape(data)) return filePath;
  }
  return null;
}

function readReport(filePath) {
  if (!filePath) return null;
  const data = tryLoadJson(filePath);
  if (!hasTargetNightlyShape(data)) return null;
  return data;
}

function extractRouteMetrics(data, route) {
  const profileData = data?.routes?.[route]?.[PROFILE];
  if (!profileData?.p75) {
    return { missing: true };
  }

  const row = { missing: false, samples: profileData.samples ?? null };
  for (const metric of METRICS) {
    row[metric] = Number(profileData.p75[metric]);
    if (!Number.isFinite(row[metric])) row[metric] = null;
  }
  return row;
}

function formatMetric(metric, value) {
  if (value === null || value === undefined) return "missing";
  if (metric === "CLS") return value.toFixed(3);
  return `${Math.round(value)}ms`;
}

function formatDelta(metric, delta, percentDelta) {
  if (!Number.isFinite(delta) || !Number.isFinite(percentDelta)) return "n/a";
  const sign = delta > 0 ? "+" : "";
  if (metric === "CLS") return `${sign}${delta.toFixed(3)} (${sign}${percentDelta.toFixed(1)}%)`;
  return `${sign}${Math.round(delta)}ms (${sign}${percentDelta.toFixed(1)}%)`;
}

function getThresholds() {
  const budgetPath = process.env.BUDGET_PATH;
  if (!budgetPath || !fs.existsSync(budgetPath)) return null;
  const budget = tryLoadJson(budgetPath);
  return budget?.thresholds?.[PROFILE] ?? null;
}

function headroomValue(metric, threshold, value) {
  if (!Number.isFinite(threshold) || !Number.isFinite(value)) return null;
  return threshold - value;
}

function isNearThreshold(threshold, value) {
  if (!Number.isFinite(threshold) || !Number.isFinite(value)) return false;
  return value >= threshold * 0.95;
}

function isLikelyRegression(metric, currentValue, previousValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return false;
  if (currentValue <= previousValue) return false;
  const delta = currentValue - previousValue;
  const percentDelta = previousValue === 0 ? Infinity : (delta / previousValue) * 100;
  const absFloor = REGRESSION_ABS_FLOOR[metric] ?? 0;
  return delta >= absFloor && percentDelta >= 5;
}

const currentArtifactDir = process.env.CURRENT_ARTIFACT_DIR ?? ".artifacts/current";
const previousArtifactDir = process.env.PREVIOUS_ARTIFACT_DIR ?? ".artifacts/previous";
const currentFile = findResultsJson(currentArtifactDir);
const previousFile = findResultsJson(previousArtifactDir);

const current = readReport(currentFile);
if (!current) {
  console.log("## Findings");
  console.log("- Nightly artifact was not parseable or missing expected route/profile data.");
  console.log("- Expected a JSON artifact containing `slow-network` p75 for `/`, `/project/[id]/protocol`, `/project/[id]/notes`.");
  console.log("");
  console.log("## Implications");
  console.log("- The nightly run produced no actionable route-level summary for the required scope.");
  console.log("");
  console.log("## Recommended Next Actions");
  console.log("1. Verify the uploaded artifact contains `results-nightly.json` from the nightly matrix.");
  console.log("2. Re-run `Performance Certification` after fixing artifact generation/upload.");
  process.exit(0);
}

const previous = readReport(previousFile);
const thresholds = getThresholds();

const rows = TARGET_ROUTES.map((route) => ({
  route,
  current: extractRouteMetrics(current, route),
  previous: previous ? extractRouteMetrics(previous, route) : null,
}));

const missingRoutes = rows.filter((row) => row.current.missing).map((row) => row.route);

const nearBudgetFlags = [];
const regressionFlags = [];
const suspiciousVarianceFlags = [];

for (const row of rows) {
  if (row.current.missing) continue;
  for (const metric of METRICS) {
    const value = row.current[metric];
    const threshold = thresholds ? Number(thresholds[metric]) : NaN;

    if (isNearThreshold(threshold, value)) {
      nearBudgetFlags.push(`${row.route} ${metric} (${formatMetric(metric, value)} vs limit ${formatMetric(metric, threshold)})`);
    }

    if (!row.previous || row.previous.missing) continue;
    const prev = row.previous[metric];
    if (!Number.isFinite(value) || !Number.isFinite(prev)) continue;

    const delta = value - prev;
    const percentDelta = prev === 0 ? Infinity : (delta / prev) * 100;
    if (isLikelyRegression(metric, value, prev)) {
      regressionFlags.push(`${row.route} ${metric} ${formatDelta(metric, delta, percentDelta)}`);
    }
    if (Math.abs(percentDelta) >= 15 && Math.abs(delta) >= (REGRESSION_ABS_FLOOR[metric] ?? 0) / 2) {
      suspiciousVarianceFlags.push(`${row.route} ${metric} ${formatDelta(metric, delta, percentDelta)}`);
    }
  }
}

let priorityRoute = null;
const routeScores = new Map();

for (const row of rows) {
  if (row.current.missing) continue;
  let score = 0;
  for (const metric of METRICS) {
    const value = row.current[metric];
    const threshold = thresholds ? Number(thresholds[metric]) : NaN;
    if (Number.isFinite(threshold) && Number.isFinite(value)) {
      score += Math.max(0, value / threshold);
      if (value >= threshold) score += 2;
      if (isNearThreshold(threshold, value)) score += 1;
    }
    if (row.previous && !row.previous.missing && isLikelyRegression(metric, value, row.previous[metric])) {
      score += 1.5;
    }
  }
  routeScores.set(row.route, score);
}

for (const [route, score] of routeScores.entries()) {
  if (!priorityRoute || score > routeScores.get(priorityRoute)) {
    priorityRoute = route;
  }
}

console.log("## Findings");
console.log(`- Source nightly run: \`${process.env.NIGHTLY_RUN_ID ?? "unknown"}\` (attempt \`${process.env.NIGHTLY_RUN_ATTEMPT ?? "unknown"}\`, conclusion \`${process.env.NIGHTLY_CONCLUSION ?? "unknown"}\`).`);
console.log(`- Parsed artifact: \`${currentFile ?? "missing"}\`.`);
console.log(`- Previous nightly artifact for comparison: ${previous ? `\`${previousFile}\`` : "not available"}.`);
if (missingRoutes.length > 0) {
  console.log(`- Missing required slow-network route data: ${missingRoutes.map((route) => `\`${route}\``).join(", ")}.`);
}
if (nearBudgetFlags.length > 0) {
  console.log(`- Near budget limit: ${nearBudgetFlags.map((item) => `\`${item}\``).join("; ")}.`);
}
if (regressionFlags.length > 0) {
  console.log(`- Likely regression vs prior nightly: ${regressionFlags.map((item) => `\`${item}\``).join("; ")}.`);
}
if (suspiciousVarianceFlags.length > 0) {
  console.log(`- Suspicious variance: ${suspiciousVarianceFlags.map((item) => `\`${item}\``).join("; ")}.`);
}
if (nearBudgetFlags.length === 0 && regressionFlags.length === 0 && suspiciousVarianceFlags.length === 0 && missingRoutes.length === 0) {
  console.log("- No immediate anomalies detected in the requested route/profile scope.");
}
console.log("");
console.log("| Route | LCP p75 | INP p75 | CLS p75 | TTFB p75 |");
console.log("|---|---:|---:|---:|---:|");
for (const row of rows) {
  if (row.current.missing) {
    console.log(`| \`${row.route}\` | missing | missing | missing | missing |`);
    continue;
  }
  console.log(`| \`${row.route}\` | ${formatMetric("LCP", row.current.LCP)} | ${formatMetric("INP", row.current.INP)} | ${formatMetric("CLS", row.current.CLS)} | ${formatMetric("TTFB", row.current.TTFB)} |`);
}

if (previous) {
  console.log("");
  console.log("| Route | LCP delta | INP delta | CLS delta | TTFB delta |");
  console.log("|---|---:|---:|---:|---:|");
  for (const row of rows) {
    if (!row.previous || row.previous.missing || row.current.missing) {
      console.log(`| \`${row.route}\` | n/a | n/a | n/a | n/a |`);
      continue;
    }

    const lcpDelta = row.current.LCP - row.previous.LCP;
    const inpDelta = row.current.INP - row.previous.INP;
    const clsDelta = row.current.CLS - row.previous.CLS;
    const ttfbDelta = row.current.TTFB - row.previous.TTFB;
    const lcpPct = row.previous.LCP === 0 ? NaN : (lcpDelta / row.previous.LCP) * 100;
    const inpPct = row.previous.INP === 0 ? NaN : (inpDelta / row.previous.INP) * 100;
    const clsPct = row.previous.CLS === 0 ? NaN : (clsDelta / row.previous.CLS) * 100;
    const ttfbPct = row.previous.TTFB === 0 ? NaN : (ttfbDelta / row.previous.TTFB) * 100;

    console.log(`| \`${row.route}\` | ${formatDelta("LCP", lcpDelta, lcpPct)} | ${formatDelta("INP", inpDelta, inpPct)} | ${formatDelta("CLS", clsDelta, clsPct)} | ${formatDelta("TTFB", ttfbDelta, ttfbPct)} |`);
  }
}

console.log("");
console.log("## Implications");
if (missingRoutes.length > 0) {
  console.log("- Missing route/profile rows reduce confidence in nightly regression detection for required routes.");
}
if (nearBudgetFlags.length > 0) {
  console.log("- At least one required route is operating close to slow-network thresholds; small degradations may flip it over budget.");
}
if (regressionFlags.length > 0) {
  console.log("- Prior-run drift indicates potentially real performance regression and should be validated in the next nightly.");
}
if (!previous) {
  console.log("- Prior-run comparison is unavailable in this report because no previous artifact was downloaded.");
}
if (missingRoutes.length === 0 && nearBudgetFlags.length === 0 && regressionFlags.length === 0 && previous) {
  console.log("- Current nightly appears stable for requested routes under the slow-network profile.");
}

console.log("");
console.log("## Recommended Next Actions");
if (priorityRoute) {
  console.log(`1. Treat \`${priorityRoute}\` as the current priority optimization target.`);
} else {
  console.log("1. No route ranking was possible; fix missing data first.");
}
if (missingRoutes.length > 0) {
  console.log("2. Fix nightly artifact completeness to ensure all required routes are present.");
} else {
  console.log("2. Continue nightly tracking and verify whether trend direction persists for two consecutive runs.");
}
if (nearBudgetFlags.length > 0 || regressionFlags.length > 0) {
  console.log("3. Open a focused performance issue for route-level investigation (payload size, render blocking, server latency).");
}
