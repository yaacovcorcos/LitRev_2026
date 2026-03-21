import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/filename-match-primary-export", rule, {
  valid: [
    {
      code: "export function HomeClient() {}",
      filename: "/repo/next-app/app/HomeClient.tsx",
    },
    {
      code: "export function ProjectPage() {}",
      filename: "/repo/next-app/app/project/[id]/page.tsx",
    },
    {
      code: "export function useWidgetHelpers() {}",
      filename: "/repo/next-app/components/utils.ts",
    },
    {
      code: "export function PrimaryThing() {} export const secondaryThing = true;",
      filename: "/repo/next-app/components/PrimaryThing.tsx",
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
