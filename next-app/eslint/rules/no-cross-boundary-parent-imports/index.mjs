import { isTestFile, isUiRuntimeFile } from "../../shared.mjs";

function isParentRelativeSource(source) {
  return typeof source?.value === "string" && source.value.startsWith("../");
}

const defaultExport = {
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
        if (isParentRelativeSource(node.source)) {
          context.report({ node: node.source, messageId: "noParentImport" });
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source && isParentRelativeSource(node.source)) {
          context.report({ node: node.source, messageId: "noParentImport" });
        }
      },
      ExportAllDeclaration(node) {
        if (isParentRelativeSource(node.source)) {
          context.report({ node: node.source, messageId: "noParentImport" });
        }
      },
      ImportExpression(node) {
        if (isParentRelativeSource(node.source)) {
          context.report({ node: node.source, messageId: "noParentImport" });
        }
      },
    };
  },
};

export default defaultExport;
