import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-cross-boundary-parent-imports", rule, {
  valid: [
    {
      code: "import { thing } from './local';",
      filename: "/repo/next-app/components/Foo.tsx",
    },
    {
      code: "import { thing } from '@/components/Foo';",
      filename: "/repo/next-app/components/Foo.tsx",
    },
  ],
  invalid: [
    {
      code: "import { thing } from '../other/Foo';",
      filename: "/repo/next-app/components/Foo.tsx",
      errors: [{ messageId: "noParentImport" }],
    },
  ],
});
