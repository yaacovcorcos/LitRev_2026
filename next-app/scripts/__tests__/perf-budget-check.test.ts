import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runBudgetCheck } from "../perf-budget-check.mjs";

const tempDirs: string[] = [];

type WaiverEntry = {
  route: string;
  profile: string;
  metric: string;
  approver: string;
  reason: string;
  expiresAt: string;
  followUp: string;
};

type WaiverDocument = {
  version: number;
  waivers: WaiverEntry[];
};

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

function makeArtifactRoots(root: string) {
  return {
    baselineRoot: root,
    resultsRoot: root,
  };
}

function writeDefaultArtifacts(cwd: string, { waivers = { version: 1, waivers: [] } as WaiverDocument } = {}) {
  writeJson(path.join(cwd, "budget.json"), makeBudget());
  writeJson(path.join(cwd, "baseline.json"), makeRun());
  writeJson(path.join(cwd, "results.json"), makeRun());
  writeJson(path.join(cwd, "waivers.json"), waivers);
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
    writeJson(path.join(cwd, "waivers.json"), { version: 1, waivers: [] });

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
        "--waivers",
        "./waivers.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr, artifactRoots: makeArtifactRoots(cwd) },
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
    writeJson(path.join(cwd, "waivers.json"), { version: 1, waivers: [] });

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
        "--waivers",
        "./waivers.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr, artifactRoots: makeArtifactRoots(cwd) },
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
    writeJson(path.join(cwd, "waivers.json"), { version: 1, waivers: [] });

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
        "--waivers",
        "./waivers.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr, artifactRoots: makeArtifactRoots(cwd) },
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

    writeDefaultArtifacts(cwd);
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
        "--waivers",
        "./waivers.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr, artifactRoots: makeArtifactRoots(cwd) },
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

    writeDefaultArtifacts(cwd);
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
        "--waivers",
        "./waivers.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr, artifactRoots: makeArtifactRoots(cwd) },
    );

    expect(exitCode).toBe(1);
    expect(logger.lines).toContain("stdout:[perf-budget-check] violations:");
    expect(logger.lines.some((line) => line.includes("[regression] /project/[id] desktop-normal LCP"))).toBe(true);
  });

  it("fails when the budget path escapes the allowed artifact roots", () => {
    const cwd = createTempDir();
    const outsideRoot = createTempDir();
    const logger = createLogger();

    writeJson(path.join(outsideRoot, "budget.json"), makeBudget());
    writeJson(path.join(cwd, "waivers.json"), { version: 1, waivers: [] });

    const exitCode = runBudgetCheck(
      [
        "node",
        "scripts/perf-budget-check.mjs",
        "--budget",
        `${outsideRoot}/budget.json`,
        "--baseline",
        "./baseline.json",
        "--results",
        "./results.json",
        "--waivers",
        "./waivers.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr, artifactRoots: makeArtifactRoots(cwd) },
    );

    expect(exitCode).toBe(1);
    expect(logger.lines.some((line) => line.includes("[invalid-budget-path]"))).toBe(true);
  });

  it("passes in enforce mode when a matching valid waiver exists", () => {
    const cwd = createTempDir();
    const logger = createLogger();

    writeJson(path.join(cwd, "budget.json"), makeBudget());
    writeJson(path.join(cwd, "baseline.json"), makeRun({ lcp: 1900 }));
    writeJson(path.join(cwd, "results.json"), makeRun({ lcp: 2100 }));
    writeJson(path.join(cwd, "waivers.json"), {
      version: 1,
      waivers: [
        {
          route: "/project/[id]",
          profile: "desktop-normal",
          metric: "LCP",
          approver: "perf-owner",
          reason: "Temporary exception while CLS remediation lands",
          expiresAt: "2026-03-20T00:00:00.000Z",
          followUp: "SPD-002",
        },
      ],
    });

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
        "--waivers",
        "./waivers.json",
      ],
      {
        cwd,
        stdout: logger.stdout,
        stderr: logger.stderr,
        artifactRoots: makeArtifactRoots(cwd),
        now: new Date("2026-03-10T12:00:00.000Z"),
      },
    );

    expect(exitCode).toBe(0);
    expect(logger.lines.some((line) => line.includes("[waived] [regression] /project/[id] desktop-normal LCP"))).toBe(true);
  });

  it("does not waive threshold breaches", () => {
    const cwd = createTempDir();
    const logger = createLogger();

    writeJson(path.join(cwd, "budget.json"), makeBudget());
    writeJson(path.join(cwd, "baseline.json"), makeRun({ lcp: 2150 }));
    writeJson(path.join(cwd, "results.json"), makeRun({ lcp: 2300 }));
    writeJson(path.join(cwd, "waivers.json"), {
      version: 1,
      waivers: [
        {
          route: "/project/[id]",
          profile: "desktop-normal",
          metric: "LCP",
          approver: "perf-owner",
          reason: "Regression-only waiver should not suppress hard thresholds",
          expiresAt: "2026-03-20T00:00:00.000Z",
          followUp: "SPD-002",
        },
      ],
    });

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
        "--waivers",
        "./waivers.json",
      ],
      {
        cwd,
        stdout: logger.stdout,
        stderr: logger.stderr,
        artifactRoots: makeArtifactRoots(cwd),
        now: new Date("2026-03-10T12:00:00.000Z"),
      },
    );

    expect(exitCode).toBe(1);
    expect(logger.lines.some((line) => line.includes("[threshold] /project/[id] desktop-normal LCP"))).toBe(true);
    expect(logger.lines.some((line) => line.includes("[waived] [threshold]"))).toBe(false);
  });

  it("fails when a waiver is expired", () => {
    const cwd = createTempDir();
    const logger = createLogger();

    writeDefaultArtifacts(cwd, {
      waivers: {
        version: 1,
        waivers: [
          {
            route: "/project/[id]",
            profile: "desktop-normal",
            metric: "CLS",
            approver: "perf-owner",
            reason: "Expired waiver",
            expiresAt: "2026-03-01T00:00:00.000Z",
            followUp: "SPD-002",
          },
        ],
      },
    });

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
        "--waivers",
        "./waivers.json",
      ],
      {
        cwd,
        stdout: logger.stdout,
        stderr: logger.stderr,
        artifactRoots: makeArtifactRoots(cwd),
        now: new Date("2026-03-10T12:00:00.000Z"),
      },
    );

    expect(exitCode).toBe(1);
    expect(logger.lines.some((line) => line.includes("[expired-waiver] /project/[id] desktop-normal CLS"))).toBe(true);
  });

  it("fails when the waivers file is malformed", () => {
    const cwd = createTempDir();
    const logger = createLogger();

    writeDefaultArtifacts(cwd, {
      waivers: {
        version: 1,
        waivers: [
          {
            route: "/project/[id]",
            profile: "desktop-normal",
            metric: "CLS",
            approver: "perf-owner",
            reason: "",
            expiresAt: "2026-03-20T00:00:00.000Z",
            followUp: "SPD-002",
          },
        ],
      },
    });

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
        "--waivers",
        "./waivers.json",
      ],
      { cwd, stdout: logger.stdout, stderr: logger.stderr, artifactRoots: makeArtifactRoots(cwd) },
    );

    expect(exitCode).toBe(1);
    expect(logger.lines.some((line) => line.includes("[invalid-waivers] waiver 0 is missing reason"))).toBe(true);
  });
});
