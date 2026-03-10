#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith("--mode="));
const mode = modeArg ? modeArg.split("=")[1] : "warn";
const enforce = mode === "enforce";

const repoRoot = process.cwd();
const scanRoots = [
  "app",
  "components",
  "contexts",
  "hooks",
  path.join("lib", "ai"),
];

const allowedChunkBranchFiles = new Set([
  path.normalize(path.join("components", "copilot", "StreamReducer.ts")),
  path.normalize(path.join("contexts", "project-copilot-stream-events.ts")),
  path.normalize(path.join("hooks", "useCopilotStreamActions.ts")),
  path.normalize(path.join("lib", "ai", "ai-stream-runtime.ts")),
  path.normalize(path.join("lib", "ai", "shared-stream-reducer.ts")),
  path.normalize(path.join("lib", "ai", "stream-processor.ts")),
]);

const allowedReduceUsageFiles = new Set([
  path.normalize(path.join("contexts", "project-copilot-stream-events.ts")),
  path.normalize(path.join("lib", "ai", "ai-stream-runtime.ts")),
  path.normalize(path.join("lib", "ai", "popup-stream-runtime.ts")),
  path.normalize(path.join("lib", "ai", "shared-stream-reducer.ts")),
]);

const chunkBranchPattern = /(\bdata\s*\.\s*type\s*===\s*["'])|(\bchunk\s*\.\s*type\s*===\s*["'])|(switch\s*\(\s*(data|chunk)\s*\.\s*type\s*\))/;
const reducerUsagePattern = /\breduceSharedStreamChunk\s*\(/;

function walkFiles(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!fullPath.endsWith(".ts") && !fullPath.endsWith(".tsx")) continue;
    if (fullPath.includes(".test.") || fullPath.includes("__tests__")) continue;
    out.push(fullPath);
  }
}

function collectFiles() {
  const files = [];
  for (const root of scanRoots) {
    const absRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absRoot)) continue;
    walkFiles(absRoot, files);
  }
  return files;
}

const files = collectFiles();
const violations = [];

for (const absFile of files) {
  const relFile = path.normalize(path.relative(repoRoot, absFile));
  const source = fs.readFileSync(absFile, "utf8");

  if (chunkBranchPattern.test(source) && !allowedChunkBranchFiles.has(relFile)) {
    violations.push({
      type: "chunk-branch",
      file: relFile,
      message: "Found direct stream chunk branching outside allowed adapter/reducer files.",
    });
  }

  if (reducerUsagePattern.test(source) && !allowedReduceUsageFiles.has(relFile)) {
    violations.push({
      type: "reducer-usage",
      file: relFile,
      message: "Found reduceSharedStreamChunk() usage outside approved shared adapters.",
    });
  }
}

if (violations.length === 0) {
  console.log(`[chat-stream-guard] ok (${mode})`);
  process.exit(0);
}

const header = enforce
  ? "[chat-stream-guard] violations (enforce mode)"
  : "[chat-stream-guard] violations (warn mode)";
console.error(header);
for (const violation of violations) {
  console.error(`- [${violation.type}] ${violation.file}: ${violation.message}`);
}

if (enforce) {
  process.exit(1);
}

process.exit(0);
