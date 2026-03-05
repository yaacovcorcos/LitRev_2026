#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    input: path.resolve(process.cwd(), "../output/performance/baseline/baseline-latest.json"),
    output: path.resolve(process.cwd(), "../docs/reports/performance/perf-baseline-latest.md"),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const [key, maybeVal] = value.slice(2).split("=");
    const next = maybeVal ?? argv[i + 1];
    if (maybeVal == null && argv[i + 1] && !argv[i + 1].startsWith("--")) i += 1;
    if (key === "input" && next) args.input = path.resolve(process.cwd(), next);
    if (key === "output" && next) args.output = path.resolve(process.cwd(), next);
  }

  return args;
}

function renderTableRows(routes = {}) {
  const lines = [];
  for (const [route, profiles] of Object.entries(routes)) {
    for (const [profile, data] of Object.entries(profiles)) {
      const p75 = data?.p75 ?? {};
      const samples = data?.samples ?? 0;
      lines.push(`| ${route} | ${profile} | ${samples} | ${p75.LCP ?? "-"} | ${p75.INP ?? "-"} | ${p75.CLS ?? "-"} | ${p75.TTFB ?? "-"} |`);
    }
  }
  return lines;
}

function main() {
  const args = parseArgs(process.argv);
  const input = JSON.parse(fs.readFileSync(args.input, "utf8"));

  const rows = renderTableRows(input.routes);
  const markdown = [
    "# Performance Baseline Report",
    "",
    `- Captured at: ${input.capturedAt ?? "unknown"}`,
    `- Commit: ${input.commit ?? "unknown"}`,
    `- Source: ${path.relative(process.cwd(), args.input)}`,
    "",
    "| Route | Profile | Samples | LCP p75 (ms) | INP p75 (ms) | CLS p75 | TTFB p75 (ms) |",
    "|---|---|---:|---:|---:|---:|---:|",
    ...rows,
    "",
    "## Notes",
    "- This report is generated from the baseline JSON artifact.",
    "- CI gate authority remains synthetic probe outputs.",
  ].join("\n");

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, markdown);
  console.log(`[perf-baseline-report] wrote ${args.output}`);
}

main();
