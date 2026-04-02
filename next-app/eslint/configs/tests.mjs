import {
  PREFER_COLOCATED_TEST_DOMAINS,
  REQUIRE_RUNTIME_TEST_DOMAINS,
} from "../runtime-test-governance.mjs";

const defaultExport = {
  name: "litrev/tests",
  files: [
    "lib/agent/**/*.ts",
    "lib/server/agent/**/*.ts",
    "lib/server/ai/tools/**/*.ts",
  ],
  rules: {
    "litrev/require-tests-for-runtime-files": [
      "warn",
      {
        domains: REQUIRE_RUNTIME_TEST_DOMAINS,
      },
    ],
    "litrev/prefer-colocated-tests-in-selected-domains": [
      "warn",
      {
        domains: PREFER_COLOCATED_TEST_DOMAINS,
      },
    ],
  },
};

export default defaultExport;
