/** @type {import('stylelint').Config} */
module.exports = {
  ignoreFiles: [".next/**", "node_modules/**", "coverage/**"],
  rules: {
    "color-no-hex": [true, { severity: "warning" }],
    "selector-pseudo-class-no-unknown": [
      true,
      {
        ignorePseudoClasses: ["global"],
      },
    ],
    "declaration-property-value-disallowed-list": [
      {
        "z-index": ["/^(?:[2-9]|[1-9][0-9]+)$/"],
        "box-shadow": ["/^(?!none$|var\\(--shadow-[a-z0-9-]+\\)$).+/i"],
      },
      { severity: "warning" },
    ],
  },
  overrides: [
    {
      files: ["styles/tokens.css"],
      rules: {
        "color-no-hex": null,
        "declaration-property-value-disallowed-list": null,
      },
    },
  ],
};
