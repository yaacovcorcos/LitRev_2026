import {
  REQUIRE_RUNTIME_TEST_DOMAINS,
  getRuntimeTestImpactWaiver,
  hasNearbyRuntimeTest,
  isGovernedRuntimeTestFile,
  loadRuntimeTestImpactWaivers,
} from "../../runtime-test-governance.mjs";

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
    const domains = context.options[0]?.domains ?? REQUIRE_RUNTIME_TEST_DOMAINS;
    const filename = context.filename;
    if (!isGovernedRuntimeTestFile(filename, domains)) return {};
    const waivers = loadRuntimeTestImpactWaivers();

    return {
      Program(node) {
        const waiver = getRuntimeTestImpactWaiver(filename, waivers);
        if (!hasNearbyRuntimeTest(filename) && !waiver) {
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
