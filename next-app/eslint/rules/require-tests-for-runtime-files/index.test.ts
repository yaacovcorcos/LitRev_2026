import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, vi } from "vitest";
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
  vi.restoreAllMocks();
});

createRuleTester().run("litrev/require-tests-for-runtime-files", rule, {
  valid: [
    {
      code: "export const route = true;",
      filename: path.join(tempDir, "lib/agent/router.ts"),
    },
  ],
  invalid: [
    {
      code: "export const planner = true;",
      filename: path.join(tempDir, "lib/server/agent/planner.ts"),
      errors: [{ messageId: "missingTest" }],
    },
  ],
});
