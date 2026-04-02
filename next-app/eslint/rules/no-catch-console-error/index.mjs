import { isTestFile } from "../../shared.mjs";

function isConsoleError(node) {
  return node?.type === "MemberExpression"
    && node.object?.type === "Identifier"
    && node.object.name === "console"
    && node.property?.type === "Identifier"
    && node.property.name === "error";
}

const defaultExport = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow catch(console.error).",
    },
    schema: [],
    messages: {
      noCatchConsoleError: "Do not use catch(console.error). Handle the error explicitly so behavior remains intentional and reviewable.",
    },
  },
  create(context) {
    if (isTestFile(context.filename)) return {};

    return {
      CallExpression(node) {
        if (
          node.callee?.type === "MemberExpression"
          && node.callee.property?.type === "Identifier"
          && node.callee.property.name === "catch"
          && isConsoleError(node.arguments[0])
        ) {
          context.report({ node: node.arguments[0], messageId: "noCatchConsoleError" });
        }
      },
    };
  },
};

export default defaultExport;
