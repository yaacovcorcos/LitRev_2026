import { isTestFile } from "../../shared.mjs";

function isConsoleErrorCall(node) {
  return node?.type === "CallExpression"
    && node.callee?.type === "MemberExpression"
    && node.callee.object?.type === "Identifier"
    && node.callee.object.name === "console"
    && node.callee.property?.type === "Identifier"
    && node.callee.property.name === "error";
}

function nearestBlock(node) {
  let current = node.parent;
  while (current && current.type !== "BlockStatement" && current.type !== "Program") {
    current = current.parent;
  }
  return current;
}

export default {
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
    const throwBlocks = new Set();

    return {
      CallExpression(node) {
        if (isConsoleErrorCall(node)) {
          errorCalls.push(node);
        }
      },
      ThrowStatement(node) {
        const block = nearestBlock(node);
        if (block) throwBlocks.add(block);
      },
      "Program:exit"() {
        for (const call of errorCalls) {
          if (throwBlocks.has(nearestBlock(call))) {
            context.report({ node: call, messageId: "noLogAndThrow" });
          }
        }
      },
    };
  },
};
