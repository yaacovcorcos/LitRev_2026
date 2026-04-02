import path from "node:path";
import { getExportName, isIgnoredPrimaryExportFilename } from "../../shared.mjs";

const defaultExport = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn when a file's obvious primary export does not match the filename.",
    },
    schema: [],
    messages: {
      mismatch: "Filename `{{filename}}` should match the primary export `{{exportName}}`.",
    },
  },
  create(context) {
    const filename = context.filename;
    if (isIgnoredPrimaryExportFilename(filename)) return {};

    const exports = [];
    return {
      ExportNamedDeclaration(node) {
        const exportName = getExportName(node);
        if (exportName) exports.push({ exportName, node });
      },
      ExportDefaultDeclaration(node) {
        const exportName = getExportName(node);
        if (exportName) exports.push({ exportName, node });
      },
      "Program:exit"() {
        if (exports.length !== 1) return;
        const expected = path.basename(filename, path.extname(filename));
        const { exportName, node } = exports[0];
        if (exportName !== expected) {
          context.report({
            node,
            messageId: "mismatch",
            data: {
              filename: path.basename(filename),
              exportName,
            },
          });
        }
      },
    };
  },
};

export default defaultExport;
