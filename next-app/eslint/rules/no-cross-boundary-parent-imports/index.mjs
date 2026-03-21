import { isTestFile, isUiRuntimeFile } from "../../shared.mjs";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow parent-directory relative imports across UI boundaries.",
    },
    schema: [],
    messages: {
      noParentImport: "Use the `@/` alias for cross-boundary imports. Parent-directory relative imports reduce searchability and make refactors harder.",
    },
  },
  create(context) {
    const filename = context.filename;
    if (isTestFile(filename) || !isUiRuntimeFile(filename)) return {};

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value === "string" && node.source.value.startsWith("../")) {
          context.report({ node: node.source, messageId: "noParentImport" });
        }
      },
    };
  },
};
