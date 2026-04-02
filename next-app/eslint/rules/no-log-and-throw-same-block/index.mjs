import { isTestFile } from "../../shared.mjs";

function isFunctionBoundary(node) {
  return node?.type === "FunctionDeclaration"
    || node?.type === "FunctionExpression"
    || node?.type === "ArrowFunctionExpression";
}

function isConsoleErrorCall(node) {
  return node?.type === "CallExpression"
    && node.callee?.type === "MemberExpression"
    && node.callee.object?.type === "Identifier"
    && node.callee.object.name === "console"
    && node.callee.property?.type === "Identifier"
    && node.callee.property.name === "error";
}

function getExecutionOwner(node) {
  let current = node.parent;

  while (current) {
    if (current.type === "BlockStatement" || current.type === "Program") {
      return current;
    }

    if (isFunctionBoundary(current)) {
      return current;
    }

    current = current.parent;
  }

  return null;
}

const defaultExport = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow console.error in the same block as a throw statement.",
    },
    schema: [],
    messages: {
      noLogAndThrow: "Do not log with console.error and throw in the same block. Either handle locally or throw for upstream handling.",
    },
  },
  create(context) {
    if (isTestFile(context.filename)) return {};

    const errorCalls = [];
    const throwOwners = new Set();

    return {
      CallExpression(node) {
        if (isConsoleErrorCall(node)) {
          errorCalls.push(node);
        }
      },
      ThrowStatement(node) {
        const owner = getExecutionOwner(node);
        if (owner) throwOwners.add(owner);
      },
      "Program:exit"() {
        for (const call of errorCalls) {
          const owner = getExecutionOwner(call);
          if (owner && throwOwners.has(owner)) {
            context.report({ node: call, messageId: "noLogAndThrow" });
          }
        }
      },
    };
  },
};

export default defaultExport;
