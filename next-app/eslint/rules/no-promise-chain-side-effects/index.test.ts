import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-promise-chain-side-effects", rule, {
  valid: [
    {
      code: "loadThing().then(identity);",
      filename: "/repo/next-app/app/example.tsx",
    },
    {
      code: "import('./thing').then((mod) => mod.Thing);",
      filename: "/repo/next-app/components/Thing.tsx",
    },
  ],
  invalid: [
    {
      code: "loadThing().then((result) => { setState(result); });",
      filename: "/repo/next-app/app/example.tsx",
      errors: [{ messageId: "chainSideEffects" }],
    },
    {
      code: "loadThing().catch((error) => { console.warn(error); });",
      filename: "/repo/next-app/hooks/useThing.ts",
      errors: [{ messageId: "chainSideEffects" }],
    },
  ],
});
