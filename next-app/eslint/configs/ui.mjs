const defaultExport = {
  name: "litrev/ui",
  files: [
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "contexts/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
  ],
  ignores: [
    "app/actions/**",
    "app/api/**",
  ],
  rules: {
    "litrev/no-cross-boundary-parent-imports": "warn",
    "litrev/filename-match-primary-export": "warn",
    "litrev/prefer-async-await-in-ui-runtime": "warn",
    "litrev/no-promise-chain-side-effects": "warn",
    "litrev/no-window-location-navigation": "error",
  },
};

export default defaultExport;
