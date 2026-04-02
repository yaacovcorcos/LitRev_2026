export const PHASE3_UI_GLOBS = [
  "app/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "components/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "contexts/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "hooks/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

export const PHASE3_UI_IGNORES = [
  "app/actions/**",
  "app/api/**",
];

export function createPhase3SearchabilityConfigs({
  parentImportLevel = "error",
  filenameLevel = "warn",
} = {}) {
  return [
    {
      name: "litrev/phase3-searchability-imports",
      files: PHASE3_UI_GLOBS,
      ignores: PHASE3_UI_IGNORES,
      rules: {
        "litrev/no-cross-boundary-parent-imports": parentImportLevel,
      },
    },
    {
      name: "litrev/phase3-searchability-filenames",
      files: PHASE3_UI_GLOBS,
      ignores: PHASE3_UI_IGNORES,
      rules: {
        "litrev/filename-match-primary-export": filenameLevel,
      },
    },
  ];
}

const defaultExport = createPhase3SearchabilityConfigs();

export default defaultExport;
