import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/filename-match-primary-export", rule, {
  valid: [
    {
      code: "export function HomeClient() {}",
      filename: "/repo/next-app/app/HomeClient.tsx",
    },
  ],
  invalid: [
    {
      code: "export function PrimaryHomeClient() {}",
      filename: "/repo/next-app/app/HomeClient.tsx",
      errors: [{ messageId: "mismatch" }],
    },
  ],
});
