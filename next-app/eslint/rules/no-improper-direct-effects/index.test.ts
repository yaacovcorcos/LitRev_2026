import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-improper-direct-effects", rule, {
  valid: [
    {
      code: "useEffect(() => { window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }, []);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
    },
  ],
  invalid: [
    {
      code: "useEffect(() => { void loadThing().then((result) => setData(result)); }, [id]);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
      errors: [{ messageId: "effectLoading" }],
    },
    {
      code: "useEffect(() => { latest.current = value; }, [value]);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
      errors: [{ messageId: "effectLatestValueMirror" }],
    },
  ],
});
