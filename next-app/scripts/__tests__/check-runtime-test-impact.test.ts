import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getChangedFiles, runRuntimeTestImpactCheck } from "../check-runtime-test-impact.mjs";

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
  writeFile(root, "lib/server/ai/ai-service.ts");
  writeFile(root, "lib/server/ai/providers/openai.ts");
  writeFile(root, "lib/server/ai/providers/openai.test.ts");
  writeFile(root, "lib/server/ai/tool-middleware.ts");
  writeFile(root, "lib/server/__tests__/ai-service-runtime.test.ts");
  writeFile(root, "lib/server/__tests__/tool-middleware.test.ts");
  writeFile(root, "lib/server/agent/run.ts");
  writeFile(root, "lib/server/__tests__/run-lifecycle.test.ts");
  writeFile(root, "app/actions/agent.ts");
  writeFile(root, "app/actions/agent.test.ts");
  writeFile(root, "app/api/ai/stream/route.ts");
  writeFile(root, "app/api/ai/stream/__tests__/route.test.ts");
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
  it("unions committed, staged, unstaged, and untracked local changes using next-app-relative paths", () => {
    const commands: string[][] = [];
    const outputs = new Map([
      ["merge-base HEAD origin/main", "merge-base-sha"],
      ["diff --name-only --relative merge-base-sha..HEAD", "lib/server/agent/run.ts"],
      ["diff --name-only --relative --cached", "lib/server/ai/providers/openai.ts"],
      ["diff --name-only --relative", "app/actions/agent.ts\nlib/server/agent/run.ts"],
      ["ls-files --others --exclude-standard", "app/actions/agent.test.ts"],
    ]);

    const changedFiles = getChangedFiles({
      cwd: "/repo/next-app",
      env: { NODE_ENV: "test" },
      runGitImpl: (args: string[]) => {
        commands.push(args);
        return outputs.get(args.join(" ")) ?? "";
      },
    });

    expect(changedFiles).toEqual([
      "lib/server/agent/run.ts",
      "lib/server/ai/providers/openai.ts",
      "app/actions/agent.ts",
      "app/actions/agent.test.ts",
    ]);
    expect(commands).toContainEqual(["diff", "--name-only", "--relative", "--cached"]);
    expect(commands).toContainEqual(["diff", "--name-only", "--relative"]);
    expect(commands).toContainEqual(["ls-files", "--others", "--exclude-standard"]);
  });

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

  it("governs the agent service, providers, middleware, action, and stream route", () => {
    const repoRoot = createRepoFixture();
    const logger = createLogger();

    const exitCode = runRuntimeTestImpactCheck([], {
      cwd: repoRoot,
      generatedAt: "2026-03-21T00:00:00.000Z",
      getChangedFilesImpl: () => [
        "lib/server/ai/ai-service.ts",
        "lib/server/__tests__/ai-service-runtime.test.ts",
        "lib/server/ai/providers/openai.ts",
        "lib/server/ai/providers/openai.test.ts",
        "lib/server/ai/tool-middleware.ts",
        "lib/server/__tests__/tool-middleware.test.ts",
        "app/actions/agent.ts",
        "app/actions/agent.test.ts",
        "app/api/ai/stream/route.ts",
        "app/api/ai/stream/__tests__/route.test.ts",
      ],
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
    const output = logger.lines.join("\n");
    expect(output).toContain("lib/server/ai/ai-service.ts");
    expect(output).toContain("lib/server/ai/providers/openai.ts");
    expect(output).toContain("lib/server/ai/tool-middleware.ts");
    expect(output).toContain("app/actions/agent.ts");
    expect(output).toContain("app/api/ai/stream/route.ts");
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
      getChangedFilesImpl: () => [
        "lib/server/agent/run.ts",
        "lib/server/__tests__/run-lifecycle.test.ts",
      ],
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
    expect(logger.lines.join("\n")).toContain("\"failures\": []");
  });

  it("does not let a centralized-test waiver hide a runtime change when its named test did not change", () => {
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

    expect(exitCode).toBe(1);
    expect(logger.lines.join("\n")).toContain("lib/server/agent/run.ts");
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

  it("does not count a deleted test path as changed runtime coverage", () => {
    const repoRoot = createRepoFixture();
    fs.rmSync(path.join(repoRoot, "lib/agent/__tests__/router.test.ts"));
    const logger = createLogger();

    const exitCode = runRuntimeTestImpactCheck([], {
      cwd: repoRoot,
      generatedAt: "2026-03-21T00:00:00.000Z",
      getChangedFilesImpl: () => [
        "lib/agent/router.ts",
        "lib/agent/__tests__/router.test.ts",
      ],
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(1);
    expect(logger.lines.join("\n")).toContain("lib/agent/router.ts");
  });

  it("reports a deleted governed runtime file without requiring a surviving test", () => {
    const repoRoot = createRepoFixture();
    fs.rmSync(path.join(repoRoot, "lib/agent/router.ts"));
    fs.rmSync(path.join(repoRoot, "lib/agent/__tests__/router.test.ts"));
    const logger = createLogger();

    const exitCode = runRuntimeTestImpactCheck([], {
      cwd: repoRoot,
      generatedAt: "2026-03-21T00:00:00.000Z",
      getChangedFilesImpl: () => [
        "lib/agent/router.ts",
        "lib/agent/__tests__/router.test.ts",
      ],
      stdout: logger.stdout,
      stderr: logger.stderr,
    });

    expect(exitCode).toBe(0);
    const output = logger.lines.join("\n");
    expect(output).toContain('"deletedRuntimeFiles": [');
    expect(output).toContain('"lib/agent/router.ts"');
    expect(output).toContain('"failures": []');
  });
});
