import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-catch-console-error", rule, {
  valid: [
    {
      code: "promise.catch((error) => { console.error(error); });",
      filename: "/repo/next-app/app/example.ts",
    },
  ],
  invalid: [
    {
      code: "promise.catch(console.error);",
      filename: "/repo/next-app/app/example.ts",
      errors: [{ messageId: "noCatchConsoleError" }],
    },
  ],
});
