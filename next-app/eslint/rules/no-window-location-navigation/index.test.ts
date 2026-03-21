import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-window-location-navigation", rule, {
  valid: [
    {
      code: "const pathname = window.location.pathname;",
      filename: "/repo/next-app/components/Foo.tsx",
    },
  ],
  invalid: [
    {
      code: "window.location.assign('/project/1');",
      filename: "/repo/next-app/components/Foo.tsx",
      errors: [{ messageId: "noWindowLocation" }],
    },
  ],
});
