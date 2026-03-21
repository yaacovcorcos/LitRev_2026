import { relativeToRoot } from "../../shared.mjs";
import {
  PREFER_COLOCATED_TEST_DOMAINS,
  getRuntimeTestImpactWaiver,
  hasCentralRuntimeTest,
  hasColocatedRuntimeTest,
  isGovernedColocatedTestPreferenceFile,
  loadRuntimeTestImpactWaivers,
} from "../../runtime-test-governance.mjs";

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
    const domains = context.options[0]?.domains ?? PREFER_COLOCATED_TEST_DOMAINS;
    const filename = context.filename;
    if (!isGovernedColocatedTestPreferenceFile(filename, domains)) return {};
    const waivers = loadRuntimeTestImpactWaivers();

    return {
      Program(node) {
        const relative = relativeToRoot(filename);
        const waiver = getRuntimeTestImpactWaiver(filename, waivers);
        if (!hasColocatedRuntimeTest(filename) && hasCentralRuntimeTest(filename) && !waiver) {
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
