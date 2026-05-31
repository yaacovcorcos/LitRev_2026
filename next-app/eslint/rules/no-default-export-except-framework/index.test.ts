import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

createRuleTester().run("litrev/no-default-export-except-framework", rule, {
  valid: [
    {
      code: "export function HomeClient() {}",
      filename: "/repo/next-app/app/HomeClient.tsx",
    },
    {
      code: "export default function HomePage() {}",
      filename: "/repo/next-app/app/page.tsx",
    },
    {
      code: "export default function NotFound() {}",
      filename: "/repo/next-app/app/not-found.tsx",
    },
    {
      code: "export default function GlobalError() {}",
      filename: "/repo/next-app/app/global-error.tsx",
    },
    {
      code: "export default async function GET() { return Response.json({ ok: true }); }",
      filename: "/repo/next-app/app/api/ping/route.ts",
    },
    {
      code: "export default import('./query_compiler_fast_bg.wasm')",
      filename: "/repo/next-app/lib/generated/prisma/wasm-worker-loader.mjs",
    },
  ],
  invalid: [
    {
      code: "export default function HomeClient() {}",
      filename: "/repo/next-app/app/HomeClient.tsx",
      errors: [{ messageId: "noDefaultExport" }],
    },
  ],
});
