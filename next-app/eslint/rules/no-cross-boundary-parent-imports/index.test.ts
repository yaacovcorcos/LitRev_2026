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
    {
      code: "const moduleName = '../other/Foo'; import(moduleName);",
      filename: "/repo/next-app/components/Foo.tsx",
    },
  ],
  invalid: [
    {
      code: "import { thing } from '../other/Foo';",
      filename: "/repo/next-app/components/Foo.tsx",
      errors: [{ messageId: "noParentImport" }],
    },
    {
      code: "export { thing } from '../other/Foo';",
      filename: "/repo/next-app/components/Foo.tsx",
      errors: [{ messageId: "noParentImport" }],
    },
    {
      code: "export * from '../other/Foo';",
      filename: "/repo/next-app/components/Foo.tsx",
      errors: [{ messageId: "noParentImport" }],
    },
    {
      code: "const loadThing = () => import('../other/Foo');",
      filename: "/repo/next-app/components/Foo.tsx",
      errors: [{ messageId: "noParentImport" }],
    },
  ],
});
