import fs from "node:fs";
import path from "node:path";

import {
  fileExists,
  findCandidateTestFiles,
  isConfiguredDomainFile,
  isTestFile,
  normalizePath,
  relativeToRoot,
} from "./shared.mjs";

export const REQUIRE_RUNTIME_TEST_DOMAINS = [
  "lib/agent/",
  "lib/server/agent/",
  "lib/server/ai/tools/",
];

export const PREFER_COLOCATED_TEST_DOMAINS = [
  "lib/agent/",
];

export const RUNTIME_TEST_WAIVER_FILE = "eslint/runtime-test-impact-waivers.json";

const WAIVER_REQUIRED_FIELDS = ["path", "reason", "coverage", "testPath"];
const GLOB_PATTERN = /[*?[\]{}]/;
const waiverCache = new Map();

function normalizeRelativeFilePath(value) {
  return normalizePath(value).replace(/^\.\//, "");
}

function assertConcreteRelativeFilePath(value, fieldName, index) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid runtime test waiver at index ${index}: \`${fieldName}\` must be a non-empty string.`);
  }

  if (path.isAbsolute(value)) {
    throw new Error(`Invalid runtime test waiver at index ${index}: \`${fieldName}\` must be repo-relative.`);
  }

  const normalized = normalizeRelativeFilePath(value);
  if (GLOB_PATTERN.test(normalized)) {
    throw new Error(`Invalid runtime test waiver at index ${index}: \`${fieldName}\` must be a concrete path, not a glob.`);
  }

  return normalized;
}

function validateWaiverEntry(entry, index, cwd) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Invalid runtime test waiver at index ${index}: entry must be an object.`);
  }

  for (const field of WAIVER_REQUIRED_FIELDS) {
    if (!(field in entry)) {
      throw new Error(`Invalid runtime test waiver at index ${index}: missing \`${field}\`.`);
    }
  }

  const runtimeFile = assertConcreteRelativeFilePath(entry.path, "path", index);
  const testPath = assertConcreteRelativeFilePath(entry.testPath, "testPath", index);
  const reason = entry.reason.trim();
  const coverage = entry.coverage.trim();

  if (!isConfiguredDomainFile(runtimeFile, REQUIRE_RUNTIME_TEST_DOMAINS)) {
    throw new Error(`Invalid runtime test waiver at index ${index}: \`${runtimeFile}\` is outside the governed runtime-test domains.`);
  }

  if (!isTestFile(testPath)) {
    throw new Error(`Invalid runtime test waiver at index ${index}: \`${testPath}\` is not a test file path.`);
  }

  if (!reason) {
    throw new Error(`Invalid runtime test waiver at index ${index}: \`reason\` must be non-empty.`);
  }

  if (!coverage) {
    throw new Error(`Invalid runtime test waiver at index ${index}: \`coverage\` must be non-empty.`);
  }

  if (!fs.existsSync(path.join(cwd, testPath))) {
    throw new Error(`Invalid runtime test waiver at index ${index}: referenced test path \`${testPath}\` does not exist.`);
  }

  return {
    path: runtimeFile,
    reason,
    coverage,
    testPath,
  };
}

function parseRuntimeTestWaivers(raw, cwd) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid runtime test waiver file: root value must be an object.");
  }

  if (!Array.isArray(parsed.waivers)) {
    throw new Error("Invalid runtime test waiver file: `waivers` must be an array.");
  }

  const waivers = parsed.waivers.map((entry, index) => validateWaiverEntry(entry, index, cwd));
  const seen = new Set();

  for (const entry of waivers) {
    if (seen.has(entry.path)) {
      throw new Error(`Invalid runtime test waiver file: duplicate waiver entry for \`${entry.path}\`.`);
    }
    seen.add(entry.path);
  }

  return waivers;
}

export function getRuntimeTestWaiverPath(cwd = process.cwd()) {
  return path.join(cwd, RUNTIME_TEST_WAIVER_FILE);
}

export function loadRuntimeTestImpactWaivers(cwd = process.cwd()) {
  const waiverPath = getRuntimeTestWaiverPath(cwd);
  if (!fs.existsSync(waiverPath)) return [];

  const stat = fs.statSync(waiverPath);
  const cached = waiverCache.get(waiverPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.waivers;
  }

  const waivers = parseRuntimeTestWaivers(fs.readFileSync(waiverPath, "utf8"), cwd);
  waiverCache.set(waiverPath, { mtimeMs: stat.mtimeMs, waivers });
  return waivers;
}

export function getRuntimeTestImpactWaiver(filename, waivers = loadRuntimeTestImpactWaivers()) {
  const relative = normalizeRelativeFilePath(relativeToRoot(filename));
  return waivers.find((entry) => entry.path === relative) ?? null;
}

export function hasRuntimeTestImpactWaiver(filename, waivers = loadRuntimeTestImpactWaivers()) {
  return getRuntimeTestImpactWaiver(filename, waivers) !== null;
}

export function hasNearbyRuntimeTest(filename) {
  return findCandidateTestFiles(filename).some(fileExists);
}

export function getColocatedRuntimeTestCandidates(filename) {
  return findCandidateTestFiles(filename).filter((candidate) => !candidate.includes("/__tests__/"));
}

export function getCentralRuntimeTestCandidates(filename) {
  return findCandidateTestFiles(filename).filter((candidate) => candidate.includes("/__tests__/"));
}

export function hasColocatedRuntimeTest(filename) {
  return getColocatedRuntimeTestCandidates(filename).some(fileExists);
}

export function hasCentralRuntimeTest(filename) {
  return getCentralRuntimeTestCandidates(filename).some(fileExists);
}

export function isGovernedRuntimeTestFile(filename, domains = REQUIRE_RUNTIME_TEST_DOMAINS) {
  return !isTestFile(filename) && isConfiguredDomainFile(filename, domains);
}

export function isGovernedColocatedTestPreferenceFile(filename, domains = PREFER_COLOCATED_TEST_DOMAINS) {
  return !isTestFile(filename) && isConfiguredDomainFile(filename, domains);
}

export function listChangedGovernedRuntimeFiles(changedFiles, domains = REQUIRE_RUNTIME_TEST_DOMAINS) {
  return changedFiles
    .map(normalizeRelativeFilePath)
    .filter((file) => isGovernedRuntimeTestFile(file, domains));
}

export function hasChangedNearbyTestImpact(runtimeFile, changedFiles) {
  const changedSet = new Set(changedFiles.map(normalizeRelativeFilePath));
  return findCandidateTestFiles(runtimeFile).some((candidate) => changedSet.has(candidate));
}

export function buildRuntimeTestImpactSummary({
  changedFiles,
  waivers = loadRuntimeTestImpactWaivers(),
  waiverPath = RUNTIME_TEST_WAIVER_FILE,
  generatedAt = new Date().toISOString(),
} = {}) {
  const normalizedChangedFiles = changedFiles.map(normalizeRelativeFilePath);
  const changedRuntimeFiles = listChangedGovernedRuntimeFiles(normalizedChangedFiles);
  const failures = changedRuntimeFiles.filter((file) => (
    !hasRuntimeTestImpactWaiver(file, waivers)
    && !hasChangedNearbyTestImpact(file, normalizedChangedFiles)
  ));

  return {
    checkedAt: generatedAt,
    changedRuntimeFiles,
    failures,
    waiverPath,
  };
}
