import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runRuntimeTestImpactCheck } from "../check-runtime-test-impact.mjs";

const tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-test-impact-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string, contents = "export {};") {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function createRepoFixture() {
  const root = createTempDir();
  writeFile(root, "eslint/runtime-test-impact-waivers.json", JSON.stringify({ waivers: [] }, null, 2));
  writeFile(root, "lib/agent/router.ts");
  writeFile(root, "lib/agent/__tests__/router.test.ts");
  writeFile(root, "lib/server/ai/providers/openai.ts");
  writeFile(root, "lib/server/agent/run.ts");
  writeFile(root, "lib/server/__tests__/run-lifecycle.test.ts");
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

describe("check-runtime-test-impact", () => {
  it("passes when a changed governed runtime file has a changed nearby test", () => {
    const repoRoot = createRepoFixture();
    const logger = createLogger();

    const exitCode = runRuntimeTestImpactCheck([], {
      cwd: repoRoot,
      generatedAt: "2026-03-21T00:00:00.000Z",
      getChangedFilesImpl: () => ["lib/agent/router.ts", "lib/agent/__tests__/router.test.ts"],
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
    expect(logger.lines.join("\n")).toContain("\"failures\": []");
  });

  it("ignores changed files outside the finalized governed domains", () => {
    const repoRoot = createRepoFixture();
    const logger = createLogger();

    const exitCode = runRuntimeTestImpactCheck([], {
      cwd: repoRoot,
      generatedAt: "2026-03-21T00:00:00.000Z",
      getChangedFilesImpl: () => ["lib/server/ai/providers/openai.ts"],
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
    expect(logger.lines.join("\n")).toContain("\"changedRuntimeFiles\": []");
  });

  it("passes when a governed runtime file has an explicit one-file waiver", () => {
    const repoRoot = createRepoFixture();
    writeFile(
      repoRoot,
      "eslint/runtime-test-impact-waivers.json",
      JSON.stringify({
        waivers: [
          {
            path: "lib/server/agent/run.ts",
            reason: "Covered by lifecycle integration coverage.",
            coverage: "integration",
            testPath: "lib/server/__tests__/run-lifecycle.test.ts",
          },
        ],
      }, null, 2),
    );

    const logger = createLogger();
    const exitCode = runRuntimeTestImpactCheck([], {
      cwd: repoRoot,
      generatedAt: "2026-03-21T00:00:00.000Z",
      getChangedFilesImpl: () => ["lib/server/agent/run.ts"],
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
    expect(logger.lines.join("\n")).toContain("\"failures\": []");
  });

  it("fails when a governed runtime file changes without nearby test impact or waiver", () => {
    const repoRoot = createRepoFixture();
    const logger = createLogger();

    const exitCode = runRuntimeTestImpactCheck([], {
      cwd: repoRoot,
      generatedAt: "2026-03-21T00:00:00.000Z",
      getChangedFilesImpl: () => ["lib/server/agent/run.ts"],
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(1);
    expect(logger.lines.join("\n")).toContain("\"failures\": [");
    expect(logger.lines.join("\n")).toContain("lib/server/agent/run.ts");
  });
});
