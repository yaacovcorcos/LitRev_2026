import { isTestFile, isUiRuntimeFile, walk } from "../../shared.mjs";

function callbackHasUiSideEffects(callback) {
  let hasSideEffect = false;
  walk(callback, (node) => {
    if (
      node.type === "CallExpression"
      && node.callee?.type === "Identifier"
      && /^set[A-Z0-9_]/.test(node.callee.name)
    ) {
      hasSideEffect = true;
      return;
    }

    if (
      node.type === "CallExpression"
      && node.callee?.type === "MemberExpression"
      && node.callee.object?.type === "Identifier"
      && ["console", "router"].includes(node.callee.object.name)
    ) {
      hasSideEffect = true;
    }
  });
  return hasSideEffect;
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn on promise-chain callbacks that perform UI side effects.",
    },
    schema: [],
    messages: {
      chainSideEffects: "This promise chain callback performs UI side effects. Prefer an explicit async function with try/catch.",
    },
  },
  create(context) {
    const filename = context.filename;
    if (isTestFile(filename) || !isUiRuntimeFile(filename)) return {};

    return {
      CallExpression(node) {
        if (
          node.callee?.type === "MemberExpression"
          && node.callee.property?.type === "Identifier"
          && ["then", "catch"].includes(node.callee.property.name)
        ) {
          const callback = node.arguments[0];
          if (callback && callbackHasUiSideEffects(callback)) {
            context.report({ node, messageId: "chainSideEffects" });
          }
        }
      },
    };
  },
};
