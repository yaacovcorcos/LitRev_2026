export const PHASE1_APP_SURFACE_GLOBS = [
  "app/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "components/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "contexts/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "hooks/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "lib/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

export const PHASE1_SCRIPTS_GLOBS = ["scripts/**/*.{ts,tsx,js,jsx,mjs,cjs}"];
export const PHASE1_SCRIPTS_IGNORES = ["scripts/__tests__/**", "scripts/__fixtures__/**"];

export function createPhase1Configs({
  defaultExportLevel = "warn",
  catchConsoleLevel = "error",
  logAndThrowLevel = "warn",
} = {}) {
  return [
    {
      name: "litrev/phase1-app-surface",
      files: PHASE1_APP_SURFACE_GLOBS,
      rules: {
        "litrev/no-default-export-except-framework": defaultExportLevel,
        "litrev/no-catch-console-error": catchConsoleLevel,
        "litrev/no-log-and-throw-same-block": logAndThrowLevel,
      },
    },
    {
      name: "litrev/phase1-scripts-logging",
      files: PHASE1_SCRIPTS_GLOBS,
      ignores: PHASE1_SCRIPTS_IGNORES,
      rules: {
        "litrev/no-catch-console-error": catchConsoleLevel,
        "litrev/no-log-and-throw-same-block": logAndThrowLevel,
      },
    },
  ];
}

const defaultExport = createPhase1Configs();

export default defaultExport;
