import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-log-and-throw-same-block", rule, {
  valid: [
    {
      code: "if (ok) { console.error(error); return; } throw new Error('x');",
      filename: "/repo/next-app/app/example.ts",
    },
  ],
  invalid: [
    {
      code: "try { doThing(); } catch (error) { console.error(error); throw error; }",
      filename: "/repo/next-app/app/example.ts",
      errors: [{ messageId: "noLogAndThrow" }],
    },
  ],
});
