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
    {
      code: "latestMessageRef.current = message;",
      filename: "/repo/next-app/components/copilot/TimelineRenderer.tsx",
    },
  ],
  invalid: [
    {
      code: "// eslint-disable-next-line react-hooks/exhaustive-deps\nuseEffect(() => {}, []);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
      errors: [{ messageId: "noDisable" }],
    },
    {
      code: "/* eslint-disable react-hooks/exhaustive-deps */\nuseEffect(() => { void syncAction(); }, [syncAction]);",
      filename: "/repo/next-app/app/ai/page.tsx",
      errors: [{ messageId: "noDisable" }],
    },
  ],
});
