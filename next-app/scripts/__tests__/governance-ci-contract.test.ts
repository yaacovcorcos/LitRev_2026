import packageJson from "../../package.json";
import { describe, expect, it } from "vitest";

function splitCommands(command: string): string[] {
  return command
    .split("&&")
    .map((part) => part.trim())
    .filter(Boolean);
}

describe("governance CI command contract", () => {
  it("pins the required governance inventory to the completed phase verifiers", () => {
    expect(splitCommands(packageJson.scripts["governance:ci-required"])).toEqual([
      "npm run governance:check",
      "npm run lint",
      "npm run test:eslint-rules",
      "npm run test:governance-tooling",
      "npm run lint:governance:phase1",
      "npm run lint:governance:phase2-hotspots",
      "npm run lint:governance:phase3-searchability",
      "npm run lint:governance:phase4-policy",
      "npm run lint:governance:logging",
      "npm run check:runtime-test-impact",
    ]);
  });

  it("keeps informational governance limited to broad lint and audit reporting", () => {
    expect(packageJson.scripts["governance:ci-informational"]).toBe(
      "npm run lint:governance && npm run lint:governance:audit > governance-audit.json",
    );
  });
});
