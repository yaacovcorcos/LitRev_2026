import fs from "node:fs";
import path from "node:path";

export function normalizePath(filename) {
  return filename.split(path.sep).join("/");
}

export function getNextAppRoot() {
  return normalizePath(process.cwd());
}

function realpathOrNull(filename) {
  try {
    return normalizePath(fs.realpathSync.native(filename));
  } catch {
    return null;
  }
}

function realpathFromNearestExisting(filename) {
  const normalized = normalizePath(filename);
  let probe = filename;

  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (!parent || parent === probe) {
      return null;
    }
    probe = parent;
  }

  const realProbe = realpathOrNull(probe);
  if (!realProbe) return null;
  if (normalizePath(probe) === normalized) return realProbe;
  return normalizePath(path.join(realProbe, path.relative(probe, filename)));
}

export function relativeToRoot(filename) {
  const normalized = normalizePath(filename);
  if (!path.isAbsolute(filename)) {
    return normalized.replace(/^\.\//, "");
  }

  const absoluteCandidates = [normalized, realpathFromNearestExisting(filename)].filter(Boolean);
  const rootCandidates = [getNextAppRoot(), realpathFromNearestExisting(process.cwd())].filter(Boolean);

  for (const candidate of absoluteCandidates) {
    const marker = "/next-app/";
    const markerIndex = candidate.lastIndexOf(marker);
    if (markerIndex >= 0) {
      return candidate.slice(markerIndex + marker.length);
    }

    for (const root of rootCandidates) {
      const prefix = root.endsWith("/") ? root : `${root}/`;
      if (candidate.startsWith(prefix)) {
        return candidate.slice(prefix.length);
      }
    }
  }

  return normalizePath(path.relative(getNextAppRoot(), filename));
}

export function isTestFile(filename) {
  return /(?:^|\/)__tests__\/|(?:^|\/)[^/]+\.(?:test|spec)\.[jt]sx?$/.test(relativeToRoot(filename));
}

export function isGeneratedFile(filename) {
  return relativeToRoot(filename).startsWith("lib/generated/");
}

export function isFrameworkDefaultAllowedFile(filename) {
  const relative = relativeToRoot(filename);
  if (isGeneratedFile(filename)) return true;
  if (!relative.startsWith("app/")) return false;
  return /(?:^|\/)(page|layout|loading|error|route)\.[jt]sx?$/.test(relative);
}

export function isIgnoredPrimaryExportFilename(filename) {
  const relative = relativeToRoot(filename);
  if (isGeneratedFile(filename) || isTestFile(filename) || isFrameworkDefaultAllowedFile(filename)) {
    return true;
  }
  if (relative.startsWith("app/actions/") || relative.startsWith("app/api/")) {
    return true;
  }
  const base = path.basename(relative);
  return ["types.ts", "constants.ts", "utils.ts", "index.ts", "index.tsx", "providers.tsx", "forbidden.tsx"].includes(base);
}

export function isUiRuntimeFile(filename) {
  const relative = relativeToRoot(filename);
  return /^(app|components|contexts|hooks)\//.test(relative);
}

export function isHotspotEffectFile(filename) {
  const relative = relativeToRoot(filename);
  return relative === "app/ai/page.tsx"
    || relative === "contexts/ProjectCopilotContext.tsx"
    || relative === "hooks/useCopilotConversations.ts"
    || relative === "app/project/[id]/layout.tsx"
    || relative.startsWith("components/copilot/")
    || relative.startsWith("app/ai/");
}

export function isConfiguredDomainFile(filename, domains = []) {
  const relative = relativeToRoot(filename);
  return domains.some((domain) => relative.startsWith(domain));
}

export function findCandidateTestFiles(filename) {
  const relative = relativeToRoot(filename);
  const ext = path.extname(relative);
  const base = path.basename(relative, ext);
  const dir = path.dirname(relative);
  const parent = path.dirname(dir);

  return [
    path.join(dir, `${base}.test${ext}`),
    path.join(dir, `${base}.test.ts`),
    path.join(dir, `${base}.test.tsx`),
    path.join(dir, "__tests__", `${base}.test${ext}`),
    path.join(dir, "__tests__", `${base}.test.ts`),
    path.join(dir, "__tests__", `${base}.test.tsx`),
    path.join(parent, "__tests__", `${base}.test${ext}`),
    path.join(parent, "__tests__", `${base}.test.ts`),
    path.join(parent, "__tests__", `${base}.test.tsx`),
  ].map((candidate) => normalizePath(candidate));
}

export function fileExists(relativePath) {
  return fs.existsSync(path.join(getNextAppRoot(), relativePath));
}

export function getCommentPattern(comment) {
  return `${comment.loc.start.line}:${comment.value.trim()}`;
}

export function isSetterCall(node) {
  return node
    && node.type === "CallExpression"
    && node.callee?.type === "Identifier"
    && /^set[A-Z0-9_]/.test(node.callee.name);
}

export function isWindowLocationMutation(node) {
  if (!node) return false;
  if (node.type === "AssignmentExpression") {
    const left = node.left;
    if (left?.type !== "MemberExpression") return false;
    const object = left.object;
    if (
      object?.type === "MemberExpression"
      && object.object?.type === "Identifier"
      && object.object.name === "window"
      && object.property?.type === "Identifier"
      && object.property.name === "location"
    ) {
      return left.property?.type === "Identifier" && left.property.name === "href";
    }
    return left.object?.type === "Identifier" && left.object.name === "window" && left.property?.type === "Identifier" && left.property.name === "location";
  }

  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
    const calleeObject = node.callee.object;
    return calleeObject?.type === "MemberExpression"
      && calleeObject.object?.type === "Identifier"
      && calleeObject.object.name === "window"
      && calleeObject.property?.type === "Identifier"
      && calleeObject.property.name === "location"
      && node.callee.property?.type === "Identifier"
      && ["assign", "replace"].includes(node.callee.property.name);
  }

  return false;
}

export function isDynamicImportChain(node, sourceCode) {
  if (node?.callee?.type !== "MemberExpression") return false;
  const objectText = sourceCode.getText(node.callee.object ?? node.object ?? node);
  return objectText.startsWith("import(");
}

export function walk(node, visitor, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        walk(entry, visitor, seen);
      }
      continue;
    }
    if (value && typeof value.type === "string") {
      walk(value, visitor, seen);
    }
  }
}

export function getExportName(node) {
  if (
    node.type === "ExportNamedDeclaration"
    && node.declaration?.type === "FunctionDeclaration"
    && node.declaration.id
  ) {
    return node.declaration.id.name;
  }

  if (
    node.type === "ExportNamedDeclaration"
    && node.declaration?.type === "VariableDeclaration"
    && node.declaration.declarations.length === 1
  ) {
    const declarator = node.declaration.declarations[0];
    if (declarator.id?.type === "Identifier") return declarator.id.name;
  }

  if (
    node.type === "ExportDefaultDeclaration"
    && node.declaration?.type === "FunctionDeclaration"
    && node.declaration.id
  ) {
    return node.declaration.id.name;
  }

  if (node.type === "ExportDefaultDeclaration" && node.declaration?.type === "Identifier") {
    return node.declaration.name;
  }

  return null;
}

export function getEffectArguments(node) {
  if (
    node?.type !== "CallExpression"
    || node.callee?.type !== "Identifier"
    || !["useEffect", "useLayoutEffect"].includes(node.callee.name)
  ) {
    return null;
  }

  const callback = node.arguments[0];
  const deps = node.arguments[1];
  if (
    !callback
    || !["ArrowFunctionExpression", "FunctionExpression"].includes(callback.type)
    || callback.body?.type !== "BlockStatement"
  ) {
    return null;
  }

  return { callback, deps, body: callback.body };
}

export function getEffectSignals(body, sourceCode) {
  let setterCalls = 0;
  let emptySetterCalls = 0;
  let refAssignments = 0;
  let asyncSignals = 0;
  let externalSyncSignals = 0;

  walk(body, (node) => {
    if (isSetterCall(node)) {
      setterCalls += 1;
      const firstArg = node.arguments[0];
      if (
        firstArg?.type === "Literal"
        || firstArg?.type === "ArrayExpression"
        || firstArg?.type === "ObjectExpression"
        || (firstArg?.type === "Identifier" && firstArg.name === "undefined")
      ) {
        emptySetterCalls += 1;
      }
      return;
    }

    if (
      node.type === "AssignmentExpression"
      && node.left?.type === "MemberExpression"
      && node.left.property?.type === "Identifier"
      && node.left.property.name === "current"
    ) {
      refAssignments += 1;
      return;
    }

    if (
      node.type === "AwaitExpression"
      || (
        node.type === "CallExpression"
        && node.callee?.type === "MemberExpression"
        && node.callee.property?.type === "Identifier"
        && ["then", "catch", "finally"].includes(node.callee.property.name)
      )
    ) {
      asyncSignals += 1;
      return;
    }

    if (node.type === "CallExpression") {
      if (node.callee?.type === "Identifier") {
        if (/Action$/.test(node.callee.name) || /^(fetch|get|load|list|create|update|delete)/.test(node.callee.name)) {
          asyncSignals += 1;
        }

        if (["addEventListener", "removeEventListener", "scrollTo", "focus", "matchMedia", "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"].includes(node.callee.name)) {
          externalSyncSignals += 1;
        }
      }

      if (
        node.callee?.type === "MemberExpression"
        && node.callee.property?.type === "Identifier"
        && ["addEventListener", "removeEventListener", "scrollTo", "focus", "matchMedia", "requestAnimationFrame", "cancelAnimationFrame"].includes(node.callee.property.name)
      ) {
        externalSyncSignals += 1;
      }
    }

    if (node.type === "NewExpression" && node.callee?.type === "Identifier") {
      if (["ResizeObserver", "IntersectionObserver", "MutationObserver"].includes(node.callee.name)) {
        externalSyncSignals += 1;
      }
    }
  });

  return {
    setterCalls,
    emptySetterCalls,
    refAssignments,
    asyncSignals,
    externalSyncSignals,
    bodyText: sourceCode.getText(body),
  };
}
