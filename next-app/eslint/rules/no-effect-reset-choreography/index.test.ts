import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-effect-reset-choreography", rule, {
  valid: [
    {
      code: "useEffect(() => { window.scrollTo(0, 0); }, [routeId]);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
    },
    {
      code: "useLayoutEffect(() => { timelineRef.current?.scrollTo({ top: anchorTop }); }, [anchorTop]);",
      filename: "/repo/next-app/components/copilot/TimelineRenderer.tsx",
    },
  ],
  invalid: [
    {
      code: "useEffect(() => { setItems([]); setCurrentId(null); }, [projectId]);",
      filename: "/repo/next-app/components/copilot/Foo.tsx",
      errors: [{ messageId: "resetChoreography" }],
    },
    {
      code: "useEffect(() => { setApprovalState(null); setProgressSummary(undefined); }, [conversationId]);",
      filename: "/repo/next-app/components/copilot/usePendingApprovalBarState.ts",
      errors: [{ messageId: "resetChoreography" }],
    },
  ],
});
