import { isTestFile, isUiRuntimeFile } from "../../shared.mjs";

function isDynamicImportThen(node, sourceCode) {
  if (
    node.callee?.type !== "MemberExpression"
    || node.callee.property?.type !== "Identifier"
    || node.callee.property.name !== "then"
  ) {
    return false;
  }
  const objectText = sourceCode.getText(node.callee.object);
  return objectText.startsWith("import(");
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer async/await to promise chains in UI/runtime code.",
    },
    schema: [],
    messages: {
      preferAsyncAwait: "Prefer async/await over promise chaining in UI/runtime code unless this is a deliberate dynamic import or infrastructure queue.",
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
          && !isDynamicImportThen(node, context.sourceCode)
        ) {
          context.report({ node, messageId: "preferAsyncAwait" });
        }
      },
    };
  },
};
