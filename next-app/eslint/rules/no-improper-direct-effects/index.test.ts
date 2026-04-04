import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-improper-direct-effects", rule, {
  valid: [
    {
      code: "useEffect(() => { window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }, []);",
      filename: "/repo/next-app/components/chat/Foo.tsx",
    },
    {
      code: "useLayoutEffect(() => { listRef.current?.scrollTo({ top: 0 }); }, [conversationId]);",
      filename: "/repo/next-app/components/chat/ChatTimeline.tsx",
    },
  ],
  invalid: [
    {
      code: "useEffect(() => { void loadThing().then((result) => setData(result)); }, [id]);",
      filename: "/repo/next-app/components/chat/Foo.tsx",
      errors: [{ messageId: "effectLoading" }],
    },
    {
      code: "useEffect(() => { latest.current = value; }, [value]);",
      filename: "/repo/next-app/components/chat/Foo.tsx",
      errors: [{ messageId: "effectLatestValueMirror" }],
    },
    {
      code: "useEffect(() => { if (!isReady || !queuedFollowUp) return; void sendQueuedFollowUpAction(queuedFollowUp).then(() => setQueuedFollowUp(null)); }, [isReady, queuedFollowUp]);",
      filename: "/repo/next-app/components/chat/ChatComposerCore.tsx",
      errors: [{ messageId: "effectLoading" }],
    },
  ],
});
