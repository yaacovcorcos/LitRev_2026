import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/prefer-async-await-in-ui-runtime", rule, {
  valid: [
    {
      code: "import('./thing').then((mod) => mod.Thing);",
      filename: "/repo/next-app/app/example.tsx",
    },
    {
      code: "async function loadThing() { try { await postMetric(payload); } catch (error) { console.warn(error); } }",
      filename: "/repo/next-app/components/Thing.tsx",
    },
  ],
  invalid: [
    {
      code: "loadThing().then((result) => setState(result));",
      filename: "/repo/next-app/app/example.tsx",
      errors: [{ messageId: "preferAsyncAwait" }],
    },
    {
      code: "loadThing().catch(() => setError('nope'));",
      filename: "/repo/next-app/hooks/useThing.ts",
      errors: [{ messageId: "preferAsyncAwait" }],
    },
  ],
});
