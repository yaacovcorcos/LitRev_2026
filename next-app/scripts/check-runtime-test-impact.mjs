#!/usr/bin/env node

import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { buildRuntimeTestImpactSummary, loadRuntimeTestImpactWaivers } from "../eslint/runtime-test-governance.mjs";

function runGit(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function splitChangedFiles(output) {
  return output ? output.split("\n").filter(Boolean) : [];
}

export function getChangedFiles({
  cwd = process.cwd(),
  env = process.env,
  runGitImpl = runGit,
} = {}) {
  const base = env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : "origin/main";
  const mergeBase = runGitImpl(["merge-base", "HEAD", base], cwd);
  const changedFiles = [
    ...splitChangedFiles(runGitImpl(["diff", "--name-only", "--relative", `${mergeBase}..HEAD`], cwd)),
    ...splitChangedFiles(runGitImpl(["diff", "--name-only", "--relative", "--cached"], cwd)),
    ...splitChangedFiles(runGitImpl(["diff", "--name-only", "--relative"], cwd)),
    ...splitChangedFiles(runGitImpl(["ls-files", "--others", "--exclude-standard"], cwd)),
  ];
  return [...new Set(changedFiles)];
}

export function runRuntimeTestImpactCheck(argv = [], {
  cwd = process.cwd(),
  env = process.env,
  stdout = (line) => {
    process.stdout.write(`${line}\n`);
  },
  stderr = (line) => {
    process.stderr.write(`${line}\n`);
  },
  getChangedFilesImpl = getChangedFiles,
  generatedAt = new Date().toISOString(),
} = {}) {
  void argv;

  const waivers = loadRuntimeTestImpactWaivers(cwd);
  const summary = buildRuntimeTestImpactSummary({
    changedFiles: getChangedFilesImpl({ cwd, env }),
    waivers,
    waiverPath: path.relative(cwd, path.join(cwd, "eslint/runtime-test-impact-waivers.json")),
    generatedAt,
    cwd,
  });

  if (summary.failures.length > 0) {
    stderr(JSON.stringify(summary, null, 2));
    return 1;
  }

  stdout(JSON.stringify(summary, null, 2));
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(runRuntimeTestImpactCheck(process.argv.slice(2)));
}
