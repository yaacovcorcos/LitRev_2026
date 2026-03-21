import fs from "node:fs";
import path from "node:path";

export const GOVERNANCE_AUDIT_ROOTS = ["app", "components", "contexts", "hooks", "lib"];
export const GOVERNANCE_AUDIT_EXCLUDES = ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"];

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isTrackedExtension(relativePath) {
  return [".ts", ".tsx"].includes(path.extname(relativePath));
}

function isExplicitTestFile(relativePath) {
  return /\.(test|spec)\.[jt]sx?$/.test(relativePath);
}

function isUnderTestsDirectory(relativePath) {
  return /(?:^|\/)__tests__\//.test(relativePath);
}

function isSourceFile(relativePath) {
  return isTrackedExtension(relativePath) && !isExplicitTestFile(relativePath) && !isUnderTestsDirectory(relativePath);
}

function isTestFile(relativePath) {
  return isTrackedExtension(relativePath) && (isExplicitTestFile(relativePath) || isUnderTestsDirectory(relativePath));
}

function walkDirectory(rootDir, relativeDir = "") {
  const directory = path.join(rootDir, relativeDir);
  if (!fs.existsSync(directory)) return [];

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = normalizePath(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      files.push(...walkDirectory(rootDir, relativePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

export function listGovernanceTrackedFiles({ cwd = process.cwd() } = {}) {
  return GOVERNANCE_AUDIT_ROOTS.flatMap((root) => {
    const rootDir = path.join(cwd, root);
    return walkDirectory(rootDir).map((relativePath) => normalizePath(path.join(root, relativePath)));
  });
}

function countMatchingLines(filePaths, { cwd, regex }) {
  let count = 0;

  for (const relativePath of filePaths) {
    const absolutePath = path.join(cwd, relativePath);
    const contents = fs.readFileSync(absolutePath, "utf8");
    const lines = contents.split(/\r?\n/);

    for (const line of lines) {
      regex.lastIndex = 0;
      if (regex.test(line)) count += 1;
    }
  }

  return count;
}

function getUiFilePaths(filePaths) {
  return filePaths.filter((relativePath) => /^(app|components|contexts|hooks)\//.test(relativePath));
}

function getServerRuntimeFilePaths(filePaths) {
  return filePaths.filter((relativePath) => /^(lib\/server|app\/actions|app\/api)\//.test(relativePath));
}

export function buildGovernanceAudit({ cwd = process.cwd(), generatedAt = new Date().toISOString() } = {}) {
  const allTrackedFiles = listGovernanceTrackedFiles({ cwd });
  const sourceFiles = allTrackedFiles.filter(isSourceFile);
  const testFiles = allTrackedFiles.filter(isTestFile);

  return {
    generatedAt,
    cwd,
    globPolicy: {
      roots: GOVERNANCE_AUDIT_ROOTS,
      excludes: GOVERNANCE_AUDIT_EXCLUDES,
    },
    counts: {
      directEffects: countMatchingLines(sourceFiles, { cwd, regex: /\b(useEffect|useLayoutEffect)\b/ }),
      exhaustiveDepsDisables: countMatchingLines(sourceFiles, {
        cwd,
        regex: /eslint-disable(?:-next-line|-line)?\s+react-hooks\/exhaustive-deps/,
      }),
      catchConsoleError: countMatchingLines(sourceFiles, { cwd, regex: /catch\(console\.error\)/ }),
      rawConsoleCalls: countMatchingLines(sourceFiles, { cwd, regex: /console\.(error|warn|log|info)\(/ }),
      serverRuntimeRawConsoleCalls: countMatchingLines(getServerRuntimeFilePaths(sourceFiles), {
        cwd,
        regex: /console\.(error|warn|log|info)\(/,
      }),
      uiClientRawConsoleCalls: countMatchingLines(getUiFilePaths(sourceFiles), {
        cwd,
        regex: /console\.(error|warn|log|info)\(/,
      }),
      parentDirectoryImports: countMatchingLines(getUiFilePaths(sourceFiles), { cwd, regex: /from ['"]\.\.\// }),
      defaultExports: countMatchingLines(sourceFiles, { cwd, regex: /export default/ }),
      sourceFiles: sourceFiles.length,
      testFiles: testFiles.length,
    },
  };
}
