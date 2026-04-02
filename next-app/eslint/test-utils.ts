import { RuleTester } from "eslint";
import type { ESLint } from "eslint";
import parser from "@typescript-eslint/parser";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";

type LooseRuleTester = {
    run: (name: string, rule: unknown, tests: unknown) => void;
};

export function createRuleTester() {
    return new RuleTester({
        plugins: {
            "@typescript-eslint": tseslintPlugin as unknown as ESLint.Plugin,
            "react-hooks": reactHooksPlugin as unknown as ESLint.Plugin,
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
    }) as unknown as LooseRuleTester;
}
