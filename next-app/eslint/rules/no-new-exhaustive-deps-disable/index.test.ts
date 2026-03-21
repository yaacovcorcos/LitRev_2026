import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-new-exhaustive-deps-disable", rule, {
  valid: [
    {
      code: "useEffect(() => {}, []);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
    },
    {
      code: "// eslint-disable-next-line react-hooks/exhaustive-deps\nuseEffect(() => {}, []);",
      filename: "/repo/next-app/hooks/other.ts",
    },
  ],
  invalid: [
    {
      code: "// eslint-disable-next-line react-hooks/exhaustive-deps\nuseEffect(() => {}, []);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
      errors: [{ messageId: "noDisable" }],
    },
  ],
});
