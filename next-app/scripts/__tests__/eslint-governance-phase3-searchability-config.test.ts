import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import phase3Config from "../../eslint-governance-phase3-searchability.config.mjs";

const cwd = path.resolve(import.meta.dirname, "../..");

async function lintText(code: string, relativeFilePath: string) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: path.join(cwd, "eslint-governance-phase3-searchability.config.mjs"),
  });

  return eslint.lintText(code, {
    filePath: path.join(cwd, relativeFilePath),
  });
}

describe("eslint-governance-phase3-searchability.config", () => {
  it("loads the dedicated Phase 3 searchability config with the expected slices", () => {
    expect(Array.isArray(phase3Config)).toBe(true);

    const configNames = phase3Config
      .filter((entry) => typeof entry === "object" && entry !== null && "name" in entry)
      .map((entry) => entry.name);

    expect(configNames).toContain("litrev/phase3-searchability-imports");
    expect(configNames).toContain("litrev/phase3-searchability-filenames");
  });

  it("governs only UI roots and keeps lib files out of scope", async () => {
    const [componentResult] = await lintText(
      "import { thing } from '../other/Foo'; export function Foo() {}",
      "components/Foo.tsx",
    );

    expect(componentResult.messages.map((message) => message.ruleId)).toContain(
      "litrev/no-cross-boundary-parent-imports",
    );

    const [libResult] = await lintText(
      "import { thing } from '../other/Foo'; export function Foo() {}",
      "lib/utils/Foo.ts",
    );

    expect(libResult.messages.map((message) => message.ruleId)).not.toContain(
      "litrev/no-cross-boundary-parent-imports",
    );
    expect(libResult.messages.map((message) => message.ruleId)).not.toContain(
      "litrev/filename-match-primary-export",
    );
  });

  it("treats filename mismatches as errors in the dedicated Phase 3 verifier", async () => {
    const [result] = await lintText(
      "export function PrimaryThing() {}",
      "components/Thing.tsx",
    );

    expect(result.messages).toContainEqual(
      expect.objectContaining({
        ruleId: "litrev/filename-match-primary-export",
        severity: 2,
      }),
    );
  });
});
