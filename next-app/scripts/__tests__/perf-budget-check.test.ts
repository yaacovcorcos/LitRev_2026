import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runBudgetCheck } from "../perf-budget-check.mjs";

const tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perf-budget-check-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function makeBudget() {
  return {
    version: 1,
    allowedRegressionPercent: 10,
    mandatoryRoutes: ["/project/[id]"],
    mandatoryProfiles: ["desktop-normal"],
    samples: {
      ci: {
        minRunsPerRouteProfile: 9,
      },
    },
    thresholds: {
      "desktop-normal": {
        LCP: 2200,
        INP: 180,
        CLS: 0.08,
        TTFB: 600,
      },
    },
  };
}

function makeRun({ lcp = 2100, samples = 9 } = {}) {
  return {
    capturedAt: "2026-03-06T08:00:00.000Z",
    commit: "test-sha",
    source: "test-fixture",
    routes: {
      "/project/[id]": {
        "desktop-normal": {
          samples,
          p75: {
            LCP: lcp,
            INP: 170,
            CLS: 0.05,
            TTFB: 500,
          },
        },
      },
    },
  };
}

function createLogger() {
  const lines: string[] = [];
  return {
    lines,
    stdout: (line: string) => lines.push(`stdout:${line}`),
    stderr: (line: string) => lines.push(`stderr:${line}`),
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("perf-budget-check", () => {
  it("fails when baseline and results resolve to the same file", () => {
    const cwd = createTempDir();
    const budgetPath = path.join(cwd, "budget.json");
    const baselinePath = path.join(cwd, "baseline.json");
    const logger = createLogger();

    writeJson(budgetPath, makeBudget());
    writeJson(baselinePath, makeRun());

    const exitCode = runBudgetCheck(
      [
        "node",
        "scripts/perf-budget-check.mjs",
        "--budget",
        "./budget.json",
        "--baseline",
        "./baseline.json",
        "--results",
        "./baseline.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr },
    );

    expect(exitCode).toBe(1);
    expect(logger.lines).toContain(
      `stderr:[perf-budget-check] [same-path] baseline and results resolve to the same file: ${baselinePath}`,
    );
  });

  it("fails clearly when the results artifact is missing", () => {
    const cwd = createTempDir();
    const budgetPath = path.join(cwd, "budget.json");
    const baselinePath = path.join(cwd, "baseline.json");
    const logger = createLogger();

    writeJson(budgetPath, makeBudget());
    writeJson(baselinePath, makeRun());

    const exitCode = runBudgetCheck(
      [
        "node",
        "scripts/perf-budget-check.mjs",
        "--budget",
        "./budget.json",
        "--baseline",
        "./baseline.json",
        "--results",
        "./results.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr },
    );

    expect(exitCode).toBe(1);
    expect(logger.lines).toContain(
      `stderr:[perf-budget-check] [missing-results] ${path.join(cwd, "results.json")}: file not found`,
    );
  });

  it("fails clearly when the baseline artifact is missing", () => {
    const cwd = createTempDir();
    const budgetPath = path.join(cwd, "budget.json");
    const resultsPath = path.join(cwd, "results.json");
    const logger = createLogger();

    writeJson(budgetPath, makeBudget());
    writeJson(resultsPath, makeRun());

    const exitCode = runBudgetCheck(
      [
        "node",
        "scripts/perf-budget-check.mjs",
        "--budget",
        "./budget.json",
        "--baseline",
        "./baseline.json",
        "--results",
        "./results.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr },
    );

    expect(exitCode).toBe(1);
    expect(logger.lines).toContain(
      `stderr:[perf-budget-check] [missing-baseline] ${path.join(cwd, "baseline.json")}: file not found`,
    );
  });

  it("passes with distinct valid artifacts in warn mode", () => {
    const cwd = createTempDir();
    const budgetPath = path.join(cwd, "budget.json");
    const baselinePath = path.join(cwd, "baseline.json");
    const resultsPath = path.join(cwd, "results.json");
    const logger = createLogger();

    writeJson(budgetPath, makeBudget());
    writeJson(baselinePath, makeRun());
    writeJson(resultsPath, makeRun({ lcp: 2125 }));

    const exitCode = runBudgetCheck(
      [
        "node",
        "scripts/perf-budget-check.mjs",
        "--budget",
        "./budget.json",
        "--baseline",
        "./baseline.json",
        "--results",
        "./results.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr },
    );

    expect(exitCode).toBe(0);
    expect(logger.lines).toContain("stdout:[perf-budget-check] pass");
  });

  it("fails in enforce mode when regressions exceed the configured limit", () => {
    const cwd = createTempDir();
    const budgetPath = path.join(cwd, "budget.json");
    const baselinePath = path.join(cwd, "baseline.json");
    const resultsPath = path.join(cwd, "results.json");
    const logger = createLogger();

    writeJson(budgetPath, makeBudget());
    writeJson(baselinePath, makeRun({ lcp: 2000 }));
    writeJson(resultsPath, makeRun({ lcp: 2300 }));

    const exitCode = runBudgetCheck(
      [
        "node",
        "scripts/perf-budget-check.mjs",
        "--mode",
        "enforce",
        "--budget",
        "./budget.json",
        "--baseline",
        "./baseline.json",
        "--results",
        "./results.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr },
    );

    expect(exitCode).toBe(1);
    expect(logger.lines).toContain("stdout:[perf-budget-check] violations:");
    expect(logger.lines.some((line) => line.includes("[regression] /project/[id] desktop-normal LCP"))).toBe(true);
  });
});
