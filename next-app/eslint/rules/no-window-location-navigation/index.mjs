import { isTestFile, isUiRuntimeFile, isWindowLocationMutation } from "../../shared.mjs";

const defaultExport = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct browser-location navigation in UI runtime code.",
    },
    schema: [],
    messages: {
      noWindowLocation: "Do not navigate by mutating window.location directly. Use the router or an explicit navigation helper.",
    },
  },
  create(context) {
    const filename = context.filename;
    if (isTestFile(filename) || !isUiRuntimeFile(filename)) return {};

    return {
      AssignmentExpression(node) {
        if (isWindowLocationMutation(node)) {
          context.report({ node, messageId: "noWindowLocation" });
        }
      },
      CallExpression(node) {
        if (isWindowLocationMutation(node)) {
          context.report({ node, messageId: "noWindowLocation" });
        }
      },
    };
  },
};

export default defaultExport;
