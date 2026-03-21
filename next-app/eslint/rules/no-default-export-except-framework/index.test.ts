import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-default-export-except-framework", rule, {
  valid: [
    {
      code: "export function HomeClient() {}",
      filename: "/repo/next-app/app/HomeClient.tsx",
    },
    {
      code: "export default function HomePage() {}",
      filename: "/repo/next-app/app/page.tsx",
    },
  ],
  invalid: [
    {
      code: "export default function HomeClient() {}",
      filename: "/repo/next-app/app/HomeClient.tsx",
      errors: [{ messageId: "noDefaultExport" }],
    },
  ],
});
