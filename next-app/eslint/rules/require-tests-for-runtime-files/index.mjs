import { fileExists, findCandidateTestFiles, isConfiguredDomainFile, isTestFile } from "../../shared.mjs";

const DEFAULT_DOMAINS = ["lib/agent/", "lib/server/agent/", "lib/server/ai/"];

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn when runtime files in selected domains have no nearby test file.",
    },
    schema: [
      {
        type: "object",
        properties: {
          domains: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingTest: "Runtime file `{{filename}}` does not have a nearby test file in the selected domains.",
    },
  },
  create(context) {
    const domains = context.options[0]?.domains ?? DEFAULT_DOMAINS;
    const filename = context.filename;
    if (isTestFile(filename) || !isConfiguredDomainFile(filename, domains)) return {};

    return {
      Program(node) {
        const candidates = findCandidateTestFiles(filename);
        if (!candidates.some(fileExists)) {
          context.report({
            node,
            messageId: "missingTest",
            data: { filename: filename.split("/").pop() },
          });
        }
      },
    };
  },
};
