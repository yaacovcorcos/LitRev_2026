import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-effect-reset-choreography", rule, {
  valid: [
    {
      code: "useEffect(() => { window.scrollTo(0, 0); }, [routeId]);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
    },
  ],
  invalid: [
    {
      code: "useEffect(() => { setItems([]); setCurrentId(null); }, [projectId]);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
      errors: [{ messageId: "resetChoreography" }],
    },
  ],
});
