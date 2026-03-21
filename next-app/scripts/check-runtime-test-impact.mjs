#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const WAIVER_PATH = path.join(process.cwd(), "eslint/runtime-test-impact-waivers.json");
const RUNTIME_PREFIXES = ["lib/agent/", "lib/server/agent/", "lib/server/ai/"];
const TEST_RE = /(?:^|\/)__tests__\/|\.test\.[jt]sx?$/;

function run(command) {
  return execSync(command, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

function loadWaivers() {
  const raw = fs.readFileSync(WAIVER_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.waivers) ? parsed.waivers : [];
}

function getChangedFiles() {
  const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main";
  const mergeBase = run(`git merge-base HEAD ${base}`);
  const output = run(`git diff --name-only ${mergeBase}..HEAD`);
  return output ? output.split("\n").filter(Boolean) : [];
}

function hasTestImpact(runtimeFile, changedFiles) {
  const fileBase = path.basename(runtimeFile, path.extname(runtimeFile));
  return changedFiles.some((candidate) => TEST_RE.test(candidate) && candidate.includes(fileBase));
}

const changedFiles = getChangedFiles();
const waivers = loadWaivers();

const changedRuntimeFiles = changedFiles.filter((file) => (
  RUNTIME_PREFIXES.some((prefix) => file.startsWith(prefix))
  && !TEST_RE.test(file)
));

const failures = changedRuntimeFiles.filter((file) => {
  const waived = waivers.some((entry) => entry.file === file);
  return !waived && !hasTestImpact(file, changedFiles);
});

const summary = {
  checkedAt: new Date().toISOString(),
  changedRuntimeFiles,
  failures,
  waiverPath: path.relative(process.cwd(), WAIVER_PATH),
};

if (failures.length > 0) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
