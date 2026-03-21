import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildGovernanceAudit } from "../../eslint/audit.mjs";

const fixtureRoot = path.resolve(import.meta.dirname, "../__fixtures__/lint-governance-audit");

describe("lint-governance-audit", () => {
  it("uses the documented glob policy and preserves the JSON schema", () => {
    const audit = buildGovernanceAudit({
      cwd: fixtureRoot,
      generatedAt: "2026-03-21T00:00:00.000Z",
    });

    expect(audit).toEqual({
      generatedAt: "2026-03-21T00:00:00.000Z",
      cwd: fixtureRoot,
      globPolicy: {
        roots: ["app", "components", "contexts", "hooks", "lib"],
        excludes: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
      },
      counts: {
        directEffects: 4,
        exhaustiveDepsDisables: 1,
        catchConsoleError: 1,
        rawConsoleCalls: 1,
        parentDirectoryImports: 1,
        defaultExports: 1,
        sourceFiles: 4,
        testFiles: 3,
      },
    });
  });
});
