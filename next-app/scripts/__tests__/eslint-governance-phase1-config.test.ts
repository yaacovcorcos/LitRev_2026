import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import phase1Config from "../../eslint-governance-phase1.config.mjs";

const cwd = path.resolve(import.meta.dirname, "../..");

async function lintText(code: string, relativeFilePath: string) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: path.join(cwd, "eslint-governance-phase1.config.mjs"),
  });

  return eslint.lintText(code, {
    filePath: path.join(cwd, relativeFilePath),
  });
}

describe("eslint-governance-phase1.config", () => {
  it("loads the dedicated Phase 1 config with the expected slices", () => {
    expect(Array.isArray(phase1Config)).toBe(true);

    const configNames = phase1Config
      .filter((entry) => typeof entry === "object" && entry !== null && "name" in entry)
      .map((entry) => entry.name);

    expect(configNames).toContain("litrev/phase1-app-surface");
    expect(configNames).toContain("litrev/phase1-scripts-logging");
  });

  it("enforces the logging rules in scripts without widening default-export enforcement", async () => {
    const [catchResult] = await lintText(
      "Promise.resolve().catch(console.error);",
      "scripts/phase1-catch.ts",
    );
    expect(catchResult.messages.map((message) => message.ruleId)).toContain("litrev/no-catch-console-error");

    const [defaultExportResult] = await lintText(
      "export default function Tool() {}",
      "scripts/phase1-default-export.ts",
    );
    expect(defaultExportResult.messages.map((message) => message.ruleId)).not.toContain("litrev/no-default-export-except-framework");
  });
});
