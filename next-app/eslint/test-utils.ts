import { RuleTester } from "eslint";
import parser from "@typescript-eslint/parser";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export function createRuleTester() {
  return new RuleTester({
    plugins: {
      "@typescript-eslint": tseslintPlugin as any,
      "react-hooks": reactHooksPlugin as any,
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
  }) as any;
}
