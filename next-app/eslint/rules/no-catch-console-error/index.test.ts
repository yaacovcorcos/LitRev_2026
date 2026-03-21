import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-catch-console-error", rule, {
  valid: [
    {
      code: "promise.catch((error) => { console.error(error); });",
      filename: "/repo/next-app/app/example.ts",
    },
    {
      code: "promise.catch((error) => { console.error('setup failed', error); process.exitCode = 1; });",
      filename: "/repo/next-app/scripts/test-ai-setup.ts",
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
