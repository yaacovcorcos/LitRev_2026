import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import loggingConfig from "../../eslint-governance-logging.config.mjs";

const cwd = path.resolve(import.meta.dirname, "../..");

async function lintText(code: string, relativeFilePath: string) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: path.join(cwd, "eslint-governance-logging.config.mjs"),
  });

  return eslint.lintText(code, {
    filePath: path.join(cwd, relativeFilePath),
  });
}

describe("eslint-governance-logging.config", () => {
  it("loads the dedicated logging config with the expected slice", () => {
    expect(Array.isArray(loggingConfig)).toBe(true);

    const configNames = loggingConfig
      .filter((entry) => typeof entry === "object" && entry !== null && "name" in entry)
      .map((entry) => entry.name);

    expect(configNames).toContain("litrev/logging-server-runtime");
  });

  it("governs server/runtime files and keeps UI files out of scope", async () => {
    const [serverResult] = await lintText(
      "console.error('oops');",
      "lib/server/foo.ts",
    );

    expect(serverResult.messages).toContainEqual(
      expect.objectContaining({
        ruleId: "litrev/no-server-runtime-console",
        severity: 2,
      }),
    );

    const [uiResult] = await lintText(
      "console.error('oops');",
      "components/Foo.tsx",
    );

    expect(uiResult.messages.map((message) => message.ruleId)).not.toContain(
      "litrev/no-server-runtime-console",
    );
  });
});
