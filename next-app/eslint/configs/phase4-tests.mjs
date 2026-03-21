import {
  PREFER_COLOCATED_TEST_DOMAINS,
  REQUIRE_RUNTIME_TEST_DOMAINS,
} from "../runtime-test-governance.mjs";

export const PHASE4_REQUIRE_TESTS_GLOBS = [
  "lib/agent/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "lib/server/agent/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "lib/server/ai/tools/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

export const PHASE4_PREFER_COLOCATED_GLOBS = [
  "lib/agent/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

export function createPhase4TestConfigs({
  requireLevel = "error",
  colocatedLevel = "error",
} = {}) {
  return [
    {
      name: "litrev/phase4-tests-runtime",
      files: PHASE4_REQUIRE_TESTS_GLOBS,
      rules: {
        "litrev/require-tests-for-runtime-files": [
          requireLevel,
          { domains: REQUIRE_RUNTIME_TEST_DOMAINS },
        ],
      },
    },
    {
      name: "litrev/phase4-tests-colocated",
      files: PHASE4_PREFER_COLOCATED_GLOBS,
      rules: {
        "litrev/prefer-colocated-tests-in-selected-domains": [
          colocatedLevel,
          { domains: PREFER_COLOCATED_TEST_DOMAINS },
        ],
      },
    },
  ];
}

export default createPhase4TestConfigs();
