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
fs.mkdirSync(path.join(tempDir, "eslint"), { recursive: true });
fs.writeFileSync(
  path.join(tempDir, "eslint/runtime-test-impact-waivers.json"),
  JSON.stringify({
    waivers: [
      {
        path: "lib/server/agent/planner.ts",
        reason: "Covered by planner validation integration coverage.",
        coverage: "integration",
        testPath: "lib/server/__tests__/planner-validation.test.ts",
      },
    ],
  }, null, 2),
);
fs.mkdirSync(path.join(tempDir, "lib/server/__tests__"), { recursive: true });
fs.writeFileSync(path.join(tempDir, "lib/server/__tests__/planner-validation.test.ts"), "export {};");

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
    {
      code: "export const planner = true;",
      filename: path.join(tempDir, "lib/server/agent/planner.ts"),
    },
  ],
  invalid: [
    {
      code: "export const planner = true;",
      filename: path.join(tempDir, "lib/server/agent/run.ts"),
      errors: [{ messageId: "missingTest" }],
    },
  ],
});
