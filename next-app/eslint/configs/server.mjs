export default {
  name: "litrev/server",
  files: [
    "lib/server/**/*.ts",
    "lib/server/**/*.tsx",
    "app/actions/**/*.ts",
    "app/api/**/*.ts",
  ],
  rules: {
    "litrev/no-server-runtime-console": "warn",
  },
};
