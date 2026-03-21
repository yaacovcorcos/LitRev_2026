import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-server-runtime-console", rule, {
  valid: [
    {
      code: "logServerError('ai-service', 'request failed', { runId }, error);",
      filename: "/repo/next-app/lib/server/ai/service.ts",
    },
    {
      code: "console.error('[logging] allowed');",
      filename: "/repo/next-app/lib/server/logging.ts",
    },
    {
      code: "console.warn('test helper');",
      filename: "/repo/next-app/lib/server/__tests__/service.test.ts",
    },
  ],
  invalid: [
    {
      code: "console.error('boom');",
      filename: "/repo/next-app/lib/server/ai/service.ts",
      errors: [{ messageId: "noServerRuntimeConsole" }],
    },
    {
      code: "console.warn('warning');",
      filename: "/repo/next-app/app/api/example/route.ts",
      errors: [{ messageId: "noServerRuntimeConsole" }],
    },
  ],
});
