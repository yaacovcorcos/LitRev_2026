import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runGovernanceCheck } from "../check-governance-docs.mjs";

const tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "governance-check-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(repoRoot: string, relPath: string, contents = "") {
  const absPath = path.join(repoRoot, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, contents);
}

function createRepoFixture() {
  const root = createTempDir();

  writeFile(
    root,
    "AGENTS.md",
    [
      "See `docs/plans/plan-agentic.md` and `next-app/app/actions/agent.ts`.",
      "Use [cold index](docs/agents/cold-memory-index.md).",
      "Supporting runbook: `docs/plans/db-production-runbook.md`.",
      "Repo automation: `.github/workflows/ci.yml`.",
    ].join("\n"),
  );

  writeFile(
    root,
    "docs/agents/cold-memory-index.md",
    [
      "Use [agentic](../plans/plan-agentic.md) and [plans index](../plans/README.md).",
      "Runtime path: `next-app/lib/agent/router.ts`.",
    ].join("\n"),
  );

  writeFile(
    root,
    "docs/agents/specialists/agent-runtime-specialist.md",
    "Required reads: `docs/plans/plan-agentic.md`, `docs/plans/README.md`.",
  );
  writeFile(root, "docs/agents/specialists/db-ops-specialist.md", "Required reads: `docs/plans/db-production-runbook.md`.");

  writeFile(
    root,
    "docs/plans/README.md",
    [
      "# LitRev Plan Index",
      "## Ownership Scopes",
      "- [Agentic](plan-agentic.md)",
      "## External References",
      "- [PRD](../../PRD.md)",
    ].join("\n"),
  );

  writeFile(root, "docs/plans/plan-agentic.md", "# agentic");
  writeFile(root, "docs/plans/db-production-runbook.md", "# supporting");
  writeFile(root, "docs/plans/README.md", fs.readFileSync(path.join(root, "docs/plans/README.md"), "utf8"));
  writeFile(root, "docs/agents/cold-memory-index.md", fs.readFileSync(path.join(root, "docs/agents/cold-memory-index.md"), "utf8"));

  writeFile(root, "next-app/app/actions/agent.ts", "export {};");
  writeFile(root, "next-app/lib/agent/router.ts", "export {};");
  writeFile(root, ".github/workflows/ci.yml", "name: CI");

  return root;
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
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("check-governance-docs", () => {
  it("passes with valid governance references in enforce mode", () => {
    const repoRoot = createRepoFixture();
    const logger = createLogger();

    const exitCode = runGovernanceCheck(["--mode=enforce"], {
      repoRoot,
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
    expect(logger.lines.some((line) => line.includes("[governance-check] ok (enforce)"))).toBe(true);
  });

  it("fails with missing referenced path", () => {
    const repoRoot = createRepoFixture();
    fs.writeFileSync(
      path.join(repoRoot, "AGENTS.md"),
      "Broken path: `next-app/lib/server/does-not-exist.ts`.\n",
    );
    const logger = createLogger();

    const exitCode = runGovernanceCheck(["--mode=enforce"], {
      repoRoot,
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(1);
    expect(logger.lines.some((line) => line.includes("[missing_path]"))).toBe(true);
  });

  it("fails with non-active and non-allowlisted plan reference", () => {
    const repoRoot = createRepoFixture();
    writeFile(repoRoot, "docs/plans/plan-archived.md", "# old plan");
    fs.writeFileSync(
      path.join(repoRoot, "docs/agents/specialists/agent-runtime-specialist.md"),
      "Required reads: `docs/plans/plan-archived.md`.\n",
    );
    const logger = createLogger();

    const exitCode = runGovernanceCheck(["--mode=enforce"], {
      repoRoot,
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(1);
    expect(logger.lines.some((line) => line.includes("[not_allowlisted]"))).toBe(true);
  });

  it("passes allowlisted supporting plan reference", () => {
    const repoRoot = createRepoFixture();
    const logger = createLogger();

    const exitCode = runGovernanceCheck(["--mode=enforce"], {
      repoRoot,
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
    expect(logger.lines.some((line) => line.includes("db-production-runbook.md"))).toBe(true);
  });

  it("supports strict .github references", () => {
    const repoRoot = createRepoFixture();
    fs.writeFileSync(
      path.join(repoRoot, "AGENTS.md"),
      "CI path: `.github/workflows/ci.yml` and `docs/plans/plan-agentic.md`.",
    );
    const logger = createLogger();

    const exitCode = runGovernanceCheck(["--mode=enforce"], {
      repoRoot,
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
  });

  it("supports wildcard path literals for existing directories/files", () => {
    const repoRoot = createRepoFixture();
    fs.writeFileSync(
      path.join(repoRoot, "AGENTS.md"),
      [
        "Pattern refs: `next-app/lib/agent/**`.",
        "Pattern refs: `docs/plans/*.md`.",
        "Pattern refs: `docs/agents/specialists/*.md`.",
      ].join("\n"),
    );
    const logger = createLogger();

    const exitCode = runGovernanceCheck(["--mode=enforce"], {
      repoRoot,
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
  });

  it("warn mode reports violations but exits zero", () => {
    const repoRoot = createRepoFixture();
    fs.writeFileSync(path.join(repoRoot, "AGENTS.md"), "Broken path: `docs/missing.md`.");
    const logger = createLogger();

    const exitCode = runGovernanceCheck(["--mode=warn"], {
      repoRoot,
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
    expect(logger.lines.some((line) => line.includes("[missing_path]"))).toBe(true);
  });

  it("is cwd-independent via explicit repoRoot", () => {
    const repoRoot = createRepoFixture();
    const loggerA = createLogger();
    const loggerB = createLogger();

    const codeA = runGovernanceCheck(["--mode=enforce"], {
      repoRoot,
      stdout: loggerA.stdout,
      stderr: loggerA.stderr,
    });
    const codeB = runGovernanceCheck(["--mode=enforce"], {
      repoRoot: path.resolve(repoRoot),
      stdout: loggerB.stdout,
      stderr: loggerB.stderr,
    });

    expect(codeA).toBe(0);
    expect(codeB).toBe(0);
  });
});
