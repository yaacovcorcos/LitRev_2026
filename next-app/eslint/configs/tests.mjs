export default {
  name: "litrev/tests",
  files: [
    "lib/agent/**/*.ts",
    "lib/server/agent/**/*.ts",
    "lib/server/ai/**/*.ts",
  ],
  rules: {
    "litrev/require-tests-for-runtime-files": "warn",
    "litrev/prefer-colocated-tests-in-selected-domains": [
      "warn",
      {
        domains: [
          "lib/agent/",
        ],
      },
    ],
  },
};
