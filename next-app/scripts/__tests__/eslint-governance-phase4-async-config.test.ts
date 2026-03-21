import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import phase4Config from "../../eslint-governance-phase4-async.config.mjs";

const cwd = path.resolve(import.meta.dirname, "../..");

async function lintText(code: string, relativeFilePath: string) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: path.join(cwd, "eslint-governance-phase4-async.config.mjs"),
  });

  return eslint.lintText(code, {
    filePath: path.join(cwd, relativeFilePath),
  });
}

describe("eslint-governance-phase4-async.config", () => {
  it("loads the dedicated Phase 4 async config with the expected slices", () => {
    expect(Array.isArray(phase4Config)).toBe(true);

    const configNames = phase4Config
      .filter((entry) => typeof entry === "object" && entry !== null && "name" in entry)
      .map((entry) => entry.name);

    expect(configNames).toContain("litrev/phase4-async-promises");
    expect(configNames).toContain("litrev/phase4-async-navigation");
  });

  it("governs UI roots and keeps lib files out of scope", async () => {
    const [componentResult] = await lintText(
      "loadThing().then((result) => setState(result));",
      "components/Foo.tsx",
    );

    expect(componentResult.messages).toContainEqual(
      expect.objectContaining({
        ruleId: "litrev/prefer-async-await-in-ui-runtime",
        severity: 2,
      }),
    );

    const [libResult] = await lintText(
      "loadThing().then((result) => setState(result));",
      "lib/utils/Foo.ts",
    );

    expect(libResult.messages.map((message) => message.ruleId)).not.toContain(
      "litrev/prefer-async-await-in-ui-runtime",
    );
    expect(libResult.messages.map((message) => message.ruleId)).not.toContain(
      "litrev/no-promise-chain-side-effects",
    );
  });
});
