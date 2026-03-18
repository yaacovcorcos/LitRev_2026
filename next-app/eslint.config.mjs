import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "app/ai/page.tsx",
      "components/copilot/CopilotInputCore.tsx",
      "contexts/ProjectCopilotContext.tsx",
      "hooks/useCopilotConversations.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "react",
              importNames: ["useEffect", "useLayoutEffect"],
              message: "Effect discipline (warning-only): direct effects in this hot spot are reserved for explicit external synchronization. Prefer shared hooks, keyed remounts, reducers, event handlers, and derivation.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
