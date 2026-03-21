import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/prefer-async-await-in-ui-runtime", rule, {
  valid: [
    {
      code: "import('./thing').then((mod) => mod.Thing);",
      filename: "/repo/next-app/app/example.tsx",
    },
  ],
  invalid: [
    {
      code: "loadThing().then((result) => setState(result));",
      filename: "/repo/next-app/app/example.tsx",
      errors: [{ messageId: "preferAsyncAwait" }],
    },
  ],
});
