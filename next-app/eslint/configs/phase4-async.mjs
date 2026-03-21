export const PHASE4_ASYNC_GLOBS = [
  "app/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "components/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "contexts/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "hooks/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

export const PHASE4_ASYNC_IGNORES = [
  "app/actions/**",
  "app/api/**",
];

export function createPhase4AsyncConfigs({
  asyncLevel = "error",
  navigationLevel = "error",
} = {}) {
  return [
    {
      name: "litrev/phase4-async-promises",
      files: PHASE4_ASYNC_GLOBS,
      ignores: PHASE4_ASYNC_IGNORES,
      rules: {
        "litrev/prefer-async-await-in-ui-runtime": asyncLevel,
        "litrev/no-promise-chain-side-effects": asyncLevel,
      },
    },
    {
      name: "litrev/phase4-async-navigation",
      files: PHASE4_ASYNC_GLOBS,
      ignores: PHASE4_ASYNC_IGNORES,
      rules: {
        "litrev/no-window-location-navigation": navigationLevel,
      },
    },
  ];
}

export default createPhase4AsyncConfigs();
