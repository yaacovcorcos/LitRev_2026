import { defineConfig, globalIgnores } from "eslint/config";
import parser from "@typescript-eslint/parser";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";

import litrevPlugin from "./eslint/plugin.mjs";
import { createLoggingConfigs } from "./eslint/configs/logging.mjs";

const loggingConfigs = createLoggingConfigs().map((config) => ({
  ...config,
  plugins: {
    litrev: litrevPlugin,
    "@typescript-eslint": tseslintPlugin,
    "react-hooks": reactHooksPlugin,
    ...(config.plugins ?? {}),
  },
}));

export default defineConfig([
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin,
      "react-hooks": reactHooksPlugin,
      litrev: litrevPlugin,
    },
    languageOptions: {
      parser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  ...loggingConfigs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "node_modules/**",
    "next-env.d.ts",
  ]),
]);
