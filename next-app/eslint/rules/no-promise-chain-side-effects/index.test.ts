import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-promise-chain-side-effects", rule, {
  valid: [
    {
      code: "loadThing().then(identity);",
      filename: "/repo/next-app/app/example.tsx",
    },
  ],
  invalid: [
    {
      code: "loadThing().then((result) => { setState(result); });",
      filename: "/repo/next-app/app/example.tsx",
      errors: [{ messageId: "chainSideEffects" }],
    },
  ],
});
