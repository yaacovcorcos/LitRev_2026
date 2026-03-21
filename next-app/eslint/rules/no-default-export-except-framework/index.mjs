import { isFrameworkDefaultAllowedFile, isTestFile } from "../../shared.mjs";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow default exports outside framework-required and generated files.",
    },
    schema: [],
    messages: {
      noDefaultExport: "Default exports are reserved for framework-required files and generated code. Export a named symbol instead.",
    },
  },
  create(context) {
    const filename = context.filename;
    if (isTestFile(filename) || isFrameworkDefaultAllowedFile(filename)) {
      return {};
    }

    return {
      ExportDefaultDeclaration(node) {
        context.report({
          node,
          messageId: "noDefaultExport",
        });
      },
    };
  },
};
