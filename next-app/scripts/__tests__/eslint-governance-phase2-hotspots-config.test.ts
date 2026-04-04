import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import phase2Config from "../../eslint-governance-phase2-hotspots.config.mjs";

const cwd = path.resolve(import.meta.dirname, "../..");

async function lintText(code: string, relativeFilePath: string) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: path.join(cwd, "eslint-governance-phase2-hotspots.config.mjs"),
  });

  return eslint.lintText(code, {
    filePath: path.join(cwd, relativeFilePath),
  });
}

describe("eslint-governance-phase2-hotspots.config", () => {
  it("loads the dedicated Phase 2 hot-spot config with the expected slices", () => {
    expect(Array.isArray(phase2Config)).toBe(true);

    const configNames = phase2Config
      .filter((entry) => typeof entry === "object" && entry !== null && "name" in entry)
      .map((entry) => entry.name);

    expect(configNames).toContain("litrev/phase2-hotspots-mechanical");
    expect(configNames).toContain("litrev/phase2-hotspots-semantic");
    expect(configNames).toContain("litrev/phase2-hotspots-async");
  });

  it("includes the stream-actions hotspot and excludes unrelated draft hooks", async () => {
    const [streamActionsResult] = await lintText(
      "// eslint-disable-next-line react-hooks/exhaustive-deps\nexport const broken = true;",
      "hooks/useProjectConversationStreamActions.ts",
    );

    expect(streamActionsResult.messages.map((message) => message.ruleId)).toContain(
      "litrev/no-new-exhaustive-deps-disable",
    );

    const [draftHookResult] = await lintText(
      "// eslint-disable-next-line react-hooks/exhaustive-deps\nexport const ignored = true;",
      "app/project/[id]/draft/useDraftSections.ts",
    );

    expect(draftHookResult.messages.map((message) => message.ruleId)).not.toContain(
      "litrev/no-new-exhaustive-deps-disable",
    );
  });
});
