import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
import rule from "./index.mjs";
import { createRuleTester } from "../../test-utils";

const cwd = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litrev-eslint-"));

process.chdir(tempDir);
fs.mkdirSync(path.join(tempDir, "lib/agent/__tests__"), { recursive: true });
fs.writeFileSync(path.join(tempDir, "lib/agent/__tests__/router.test.ts"), "export {};");
fs.writeFileSync(path.join(tempDir, "lib/agent/__tests__/loop-controller.test.ts"), "export {};");
fs.mkdirSync(path.join(tempDir, "eslint"), { recursive: true });
fs.writeFileSync(
  path.join(tempDir, "eslint/runtime-test-impact-waivers.json"),
  JSON.stringify({
    waivers: [
      {
        path: "lib/agent/router.ts",
        reason: "Existing central runtime coverage remains accepted during Phase 4.",
        coverage: "central",
        testPath: "lib/agent/__tests__/router.test.ts",
      },
    ],
  }, null, 2),
);

afterAll(() => {
  process.chdir(cwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

createRuleTester().run("litrev/prefer-colocated-tests-in-selected-domains", rule, {
  valid: [
    {
      code: "export const helper = true;",
      filename: path.join(tempDir, "lib/server/agent/helper.ts"),
    },
    {
      code: "export const route = true;",
      filename: path.join(tempDir, "lib/agent/router.ts"),
    },
  ],
  invalid: [
    {
      code: "export const loop = true;",
      filename: path.join(tempDir, "lib/agent/loop-controller.ts"),
      errors: [{ messageId: "preferColocated" }],
    },
  ],
});
