export const LOGGING_GLOBS = [
  "lib/server/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "app/actions/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "app/api/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

export function createLoggingConfigs({
  level = "error",
} = {}) {
  return [
    {
      name: "litrev/logging-server-runtime",
      files: LOGGING_GLOBS,
      rules: {
        "litrev/no-server-runtime-console": level,
      },
    },
  ];
}

const defaultExport = createLoggingConfigs();

export default defaultExport;
