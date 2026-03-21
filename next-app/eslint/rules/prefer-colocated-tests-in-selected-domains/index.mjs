import { fileExists, findCandidateTestFiles, isConfiguredDomainFile, isTestFile, relativeToRoot } from "../../shared.mjs";

const DEFAULT_DOMAINS = ["lib/agent/"];

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn when a selected-domain runtime file only has a central __tests__ file instead of a colocated test.",
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
      preferColocated: "Prefer a colocated test for `{{filename}}` in this selected domain instead of relying only on `__tests__`.",
    },
  },
  create(context) {
    const domains = context.options[0]?.domains ?? DEFAULT_DOMAINS;
    const filename = context.filename;
    if (isTestFile(filename) || !isConfiguredDomainFile(filename, domains)) return {};

    return {
      Program(node) {
        const relative = relativeToRoot(filename);
        const candidates = findCandidateTestFiles(filename);
        const colocatedCandidates = candidates.filter((candidate) => !candidate.includes("/__tests__/"));
        const centralCandidates = candidates.filter((candidate) => candidate.includes("/__tests__/"));
        const hasColocated = colocatedCandidates.some(fileExists);
        const hasCentral = centralCandidates.some(fileExists);
        if (!hasColocated && hasCentral) {
          context.report({
            node,
            messageId: "preferColocated",
            data: { filename: relative },
          });
        }
      },
    };
  },
};
