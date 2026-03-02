import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("server action export contract", () => {
  it("does not re-export types from use server modules", () => {
    const actionsDir = path.join(process.cwd(), "app", "actions");
    const actionFiles = readdirSync(actionsDir).filter((file) => file.endsWith(".ts"));
    const offenders: string[] = [];

    for (const file of actionFiles) {
      const fullPath = path.join(actionsDir, file);
      const source = readFileSync(fullPath, "utf8");

      const isUseServerModule =
        source.includes('"use server"') || source.includes("'use server'");
      if (!isUseServerModule) continue;

      if (/\bexport\s+type\s*\{/.test(source)) {
        offenders.push(`app/actions/${file}`);
      }
    }

    expect(
      offenders,
      [
        "Type re-exports (`export type { ... }`) inside `use server` action modules",
        "can break Next action registration in runtime bundles.",
      ].join(" "),
    ).toEqual([]);
  });
});
