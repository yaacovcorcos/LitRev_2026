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
  ],
  invalid: [
    {
      code: "export const route = true;",
      filename: path.join(tempDir, "lib/agent/router.ts"),
      errors: [{ messageId: "preferColocated" }],
    },
  ],
});
