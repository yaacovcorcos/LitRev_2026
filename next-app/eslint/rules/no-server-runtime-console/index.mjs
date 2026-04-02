import {
  isGeneratedFile,
  isTestFile,
  relativeToRoot,
} from "../../shared.mjs";

const DISALLOWED_METHODS = new Set(["error", "warn", "info", "log", "debug"]);

function isConsoleMethodCall(node) {
  return node?.type === "CallExpression"
    && node.callee?.type === "MemberExpression"
    && node.callee.object?.type === "Identifier"
    && node.callee.object.name === "console"
    && node.callee.property?.type === "Identifier"
    && DISALLOWED_METHODS.has(node.callee.property.name);
}

function isAllowedLoggingHelper(filename) {
  return relativeToRoot(filename) === "lib/server/logging.ts";
}

const defaultExport = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct console usage in governed server/runtime files.",
    },
    schema: [],
    messages: {
      noServerRuntimeConsole: "Use the shared server logging helper instead of direct console calls in governed server/runtime files.",
    },
  },
  create(context) {
    if (isTestFile(context.filename) || isGeneratedFile(context.filename) || isAllowedLoggingHelper(context.filename)) {
      return {};
    }

    return {
      CallExpression(node) {
        if (isConsoleMethodCall(node)) {
          context.report({ node, messageId: "noServerRuntimeConsole" });
        }
      },
    };
  },
};

export default defaultExport;
