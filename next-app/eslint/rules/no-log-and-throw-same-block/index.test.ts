import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-log-and-throw-same-block", rule, {
  valid: [
    {
      code: "if (ok) { console.error(error); return; } throw new Error('x');",
      filename: "/repo/next-app/app/example.ts",
    },
    {
      code: "try { doThing(); } catch (error) { Promise.resolve().catch((nestedError) => console.error(nestedError)); throw error; }",
      filename: "/repo/next-app/lib/server/agent/artifacts.ts",
    },
    {
      code: "try { doThing(); } catch (error) { const reportLater = () => console.error(error); reportLater(); throw error; }",
      filename: "/repo/next-app/lib/server/agent/artifacts.ts",
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
