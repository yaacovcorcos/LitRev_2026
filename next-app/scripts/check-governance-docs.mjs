#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REFERENCE_PREFIXES = ["docs/", "next-app/", ".github/"];

const DEFAULT_ALLOWLIST = new Map([
  [
    "docs/plans/db-production-runbook.md",
    "Supporting production remediation contract referenced outside active index.",
  ],
  ["docs/plans/README.md", "Active plan registry source referenced directly by governance docs."],
]);

const ACTIVE_PLAN_SECTION_START = "## Ownership Scopes";
const ACTIVE_PLAN_SECTION_END = "## External References";

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function lineNumberForIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function resolveRepoRoot(scriptUrl = import.meta.url) {
  const scriptPath = fileURLToPath(scriptUrl);
  const scriptDir = path.dirname(scriptPath);
  const nextAppRoot = path.resolve(scriptDir, "..");
  return path.resolve(nextAppRoot, "..");
}

function listSpecialistFiles(repoRoot) {
  const specialistsDir = path.join(repoRoot, "docs", "agents", "specialists");
  if (!fs.existsSync(specialistsDir)) return [];
  return fs
    .readdirSync(specialistsDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(specialistsDir, entry))
    .sort();
}

function governanceSubjectFiles(repoRoot) {
  return [
    path.join(repoRoot, "AGENTS.md"),
    path.join(repoRoot, "docs", "agents", "cold-memory-index.md"),
    ...listSpecialistFiles(repoRoot),
  ];
}

function normalizeLinkTarget(rawTarget) {
  const target = rawTarget.trim();
  if (!target || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("mailto:")) {
    return null;
  }
  const hashIdx = target.indexOf("#");
  const queryIdx = target.indexOf("?");
  const end = [hashIdx, queryIdx].filter((idx) => idx >= 0).sort((a, b) => a - b)[0];
  const cleaned = end === undefined ? target : target.slice(0, end);
  return cleaned || null;
}

function extractReferencesFromMarkdown(sourceText, sourcePath, repoRoot) {
  const refs = [];
  const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of sourceText.matchAll(markdownLinkPattern)) {
    const rawTarget = normalizeLinkTarget(match[1]);
    if (!rawTarget) continue;
    const absolute = path.resolve(path.dirname(sourcePath), rawTarget);
    if (!absolute.startsWith(repoRoot)) continue;
    const repoRelative = toPosix(path.relative(repoRoot, absolute));
    if (!REFERENCE_PREFIXES.some((prefix) => repoRelative.startsWith(prefix))) continue;
    refs.push({
      sourceFile: toPosix(path.relative(repoRoot, sourcePath)),
      line: lineNumberForIndex(sourceText, match.index ?? 0),
      reference: repoRelative,
      kind: "markdown-link",
    });
  }

  const inlineCodePattern = /`([^`]+)`/g;
  for (const match of sourceText.matchAll(inlineCodePattern)) {
    const value = match[1].trim();
    if (!REFERENCE_PREFIXES.some((prefix) => value.startsWith(prefix))) continue;
    const sanitized = value.replace(/[),.;:]+$/g, "");
    if (!REFERENCE_PREFIXES.some((prefix) => sanitized.startsWith(prefix))) continue;
    refs.push({
      sourceFile: toPosix(path.relative(repoRoot, sourcePath)),
      line: lineNumberForIndex(sourceText, match.index ?? 0),
      reference: sanitized,
      kind: "inline-code",
    });
  }

  return refs;
}

function extractReadmePlanLinks(repoRoot) {
  const readmePath = path.join(repoRoot, "docs", "plans", "README.md");
  const text = fs.readFileSync(readmePath, "utf8");

  const links = [];
  const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of text.matchAll(markdownLinkPattern)) {
    const rawTarget = normalizeLinkTarget(match[1]);
    if (!rawTarget) continue;
    const absolute = path.resolve(path.dirname(readmePath), rawTarget);
    if (!absolute.startsWith(repoRoot)) continue;
    const rel = toPosix(path.relative(repoRoot, absolute));
    if (rel.startsWith("docs/plans/") && rel.endsWith(".md")) {
      links.push(rel);
    }
  }

  const startIndex = text.indexOf(ACTIVE_PLAN_SECTION_START);
  const endIndex = text.indexOf(ACTIVE_PLAN_SECTION_END);
  const activeSection =
    startIndex >= 0
      ? text.slice(startIndex, endIndex > startIndex ? endIndex : text.length)
      : "";

  const activeLinks = [];
  for (const match of activeSection.matchAll(markdownLinkPattern)) {
    const rawTarget = normalizeLinkTarget(match[1]);
    if (!rawTarget) continue;
    const absolute = path.resolve(path.dirname(readmePath), rawTarget);
    if (!absolute.startsWith(repoRoot)) continue;
    const rel = toPosix(path.relative(repoRoot, absolute));
    if (rel.startsWith("docs/plans/") && rel.endsWith(".md")) {
      activeLinks.push(rel);
    }
  }

  return {
    allPlanLinks: new Set(links),
    activePlanLinks: new Set(activeLinks),
  };
}

function dedupeReferences(refs) {
  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.sourceFile}:${ref.line}:${ref.reference}:${ref.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pathOrPatternExists(repoRoot, reference) {
  if (!reference.includes("*")) {
    return fs.existsSync(path.join(repoRoot, reference));
  }

  if (reference.endsWith("/**")) {
    const base = reference.slice(0, -3);
    return fs.existsSync(path.join(repoRoot, base));
  }

  const dirPart = path.dirname(reference);
  const basePattern = path.basename(reference);
  const absDir = path.join(repoRoot, dirPart);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return false;
  }

  const escaped = basePattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const matcher = new RegExp(`^${escaped}$`);
  const entries = fs.readdirSync(absDir);
  return entries.some((entry) => matcher.test(entry));
}

function collectReferences(repoRoot) {
  const refs = [];
  for (const file of governanceSubjectFiles(repoRoot)) {
    if (!fs.existsSync(file)) continue;
    const sourceText = fs.readFileSync(file, "utf8");
    refs.push(...extractReferencesFromMarkdown(sourceText, file, repoRoot));
  }
  return dedupeReferences(refs);
}

function buildViolations({ repoRoot, references, activePlanLinks, allPlanLinks, allowlist }) {
  const violations = [];

  for (const ref of references) {
    if (!pathOrPatternExists(repoRoot, ref.reference)) {
      violations.push({
        ...ref,
        code: "missing_path",
        details: "Referenced path does not exist.",
      });
      continue;
    }

    if (ref.reference.includes("*")) continue;

    if (!ref.reference.startsWith("docs/plans/") || !ref.reference.endsWith(".md")) continue;

    if (activePlanLinks.has(ref.reference) || allowlist.has(ref.reference)) {
      continue;
    }

    if (allPlanLinks.has(ref.reference)) {
      violations.push({
        ...ref,
        code: "inactive_plan_reference",
        details: "Plan is linked from plans README but not in active ownership scope and is not allowlisted.",
      });
    } else {
      violations.push({
        ...ref,
        code: "not_allowlisted",
        details: "Plan reference is outside active plan scope and not in supporting-plan allowlist.",
      });
    }
  }

  return violations;
}

export function runGovernanceCheck(argv, options = {}) {
  const modeArgIndex = argv.findIndex((arg) => arg.startsWith("--mode="));
  const mode =
    modeArgIndex >= 0 ? argv[modeArgIndex].slice("--mode=".length).trim() || "enforce" : "enforce";
  const enforce = mode === "enforce";

  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  const repoRoot = options.repoRoot ?? resolveRepoRoot(options.scriptUrl ?? import.meta.url);
  const allowlist = options.allowlist ?? DEFAULT_ALLOWLIST;

  const { activePlanLinks, allPlanLinks } = extractReadmePlanLinks(repoRoot);
  const references = collectReferences(repoRoot);
  const violations = buildViolations({
    repoRoot,
    references,
    activePlanLinks,
    allPlanLinks,
    allowlist,
  });

  const allowlistSummary = Array.from(allowlist.entries())
    .map(([file, reason]) => `${file} (${reason})`)
    .join("; ");
  stdout(`[governance-check] allowlist=${allowlistSummary}`);

  if (violations.length === 0) {
    stdout(`[governance-check] ok (${mode})`);
    return 0;
  }

  stderr(`[governance-check] violations (${mode}) count=${violations.length}`);
  for (const violation of violations) {
    stderr(
      `[${violation.code}] ${violation.sourceFile}:${violation.line} reference=${violation.reference} details=${violation.details}`,
    );
  }

  if (enforce) return 1;
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runGovernanceCheck(process.argv.slice(2)));
}
