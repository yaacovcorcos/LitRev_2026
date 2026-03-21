import { describe, expect, it } from "vitest";

import governanceConfig from "../../eslint-governance.config.mjs";

describe("eslint-governance.config", () => {
  it("loads the governance config with the expected layered slices", () => {
    expect(Array.isArray(governanceConfig)).toBe(true);

    const configNames = governanceConfig
      .filter((entry) => typeof entry === "object" && entry !== null && "name" in entry)
      .map((entry) => entry.name);

    expect(configNames).toContain("litrev/base");
    expect(configNames).toContain("litrev/phase1-app-surface");
    expect(configNames).toContain("litrev/phase1-scripts-logging");
    expect(configNames).toContain("litrev/ui");
    expect(configNames).toContain("litrev/runtime-hotspots-mechanical");
    expect(configNames).toContain("litrev/runtime-hotspots-semantic");
    expect(configNames).toContain("litrev/server");
    expect(configNames).toContain("litrev/tests");
  });
});
