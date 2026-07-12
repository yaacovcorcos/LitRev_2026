import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { REQUIRE_RUNTIME_TEST_DOMAINS } from "../../eslint/runtime-test-governance.mjs";
import phase4Config from "../../eslint-governance-phase4-tests.config.mjs";

const cwd = path.resolve(import.meta.dirname, "../..");

async function lintText(code: string, relativeFilePath: string) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: path.join(cwd, "eslint-governance-phase4-tests.config.mjs"),
  });

  return eslint.lintText(code, {
    filePath: path.join(cwd, relativeFilePath),
  });
}

describe("eslint-governance-phase4-tests.config", () => {
  it("loads the dedicated Phase 4 test-policy config with the expected slices", () => {
    expect(Array.isArray(phase4Config)).toBe(true);

    const configNames = phase4Config
      .filter((entry) => typeof entry === "object" && entry !== null && "name" in entry)
      .map((entry) => entry.name);

    expect(configNames).toContain("litrev/phase4-tests-runtime");
    expect(configNames).toContain("litrev/phase4-tests-colocated");
  });

  it("governs finalized runtime-test domains including critical provider implementations", async () => {
    const [runtimeResult] = await lintText(
      "export const planner = true;",
      "lib/server/agent/phase4-test-target.ts",
    );

    expect(runtimeResult.messages).toContainEqual(
      expect.objectContaining({
        ruleId: "litrev/require-tests-for-runtime-files",
        severity: 2,
      }),
    );

    expect(REQUIRE_RUNTIME_TEST_DOMAINS).toEqual(expect.arrayContaining([
      "lib/server/ai/ai-service.ts",
      "lib/server/ai/providers/anthropic.ts",
      "lib/server/ai/providers/google.ts",
      "lib/server/ai/providers/openai.ts",
      "lib/server/ai/providers/xai.ts",
      "lib/server/ai/tool-middleware.ts",
      "app/actions/agent.ts",
      "app/api/ai/stream/route.ts",
    ]));
  });
});
