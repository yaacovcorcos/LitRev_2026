#!/usr/bin/env node

import { execSync } from "node:child_process";

const NON_TEST_GLOBS = [
  "--glob",
  "!**/*.test.*",
  "--glob",
  "!**/*.spec.*",
  "--glob",
  "!**/__tests__/**",
];

const ROOTS = ["app", "components", "contexts", "hooks", "lib"];

function run(command) {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (typeof error.stdout === "string") {
      return error.stdout.trim();
    }
    throw error;
  }
}

function rgCount(pattern, roots = ROOTS, extraArgs = []) {
  const args = [
    "rg",
    "-n",
    JSON.stringify(pattern),
    ...roots,
    ...NON_TEST_GLOBS,
    ...extraArgs,
  ];
  const command = args.join(" ");
  const output = run(command);
  return output ? output.split("\n").filter(Boolean).length : 0;
}

function findCount(command) {
  const output = run(command);
  return Number.parseInt(output || "0", 10);
}

const audit = {
  generatedAt: new Date().toISOString(),
  cwd: process.cwd(),
  globPolicy: {
    roots: ROOTS,
    excludes: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
  },
  counts: {
    directEffects: rgCount("\\b(useEffect|useLayoutEffect)\\b"),
    exhaustiveDepsDisables: rgCount("react-hooks/exhaustive-deps|eslint-disable-next-line react-hooks/exhaustive-deps|eslint-disable react-hooks/exhaustive-deps"),
    catchConsoleError: rgCount("catch\\(console\\.error\\)"),
    rawConsoleCalls: rgCount("console\\.(error|warn|log|info)\\("),
    parentDirectoryImports: rgCount("from ['\\\"]\\.\\./", ["app", "components", "contexts", "hooks"]),
    defaultExports: rgCount("export default"),
    sourceFiles: findCount("find app components contexts hooks lib -type f \\( -name '*.ts' -o -name '*.tsx' \\) ! -name '*.test.*' ! -path '*/__tests__/*' | wc -l"),
    testFiles: findCount("find app components contexts hooks lib -type f \\( -name '*.test.ts' -o -name '*.test.tsx' \\) -o -path '*/__tests__/*' | wc -l"),
  },
};

console.log(JSON.stringify(audit, null, 2));
