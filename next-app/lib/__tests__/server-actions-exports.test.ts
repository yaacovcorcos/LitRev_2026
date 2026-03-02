import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("server action module export hygiene", () => {
    it("disallows type re-export blocks from `use server` action modules", () => {
        const actionsDir = path.resolve(process.cwd(), "app/actions");
        const files = readdirSync(actionsDir).filter((file) => file.endsWith(".ts"));
        const offenders: string[] = [];

        for (const file of files) {
            const fullPath = path.join(actionsDir, file);
            const source = readFileSync(fullPath, "utf8");
            const isServerActionModule = source.includes("\"use server\"") || source.includes("'use server'");
            if (!isServerActionModule) continue;

            // Turbopack can mis-handle `export type { ... }` in server-action modules.
            if (/^\s*export\s+type\s*\{/m.test(source)) {
                offenders.push(file);
            }
        }

        expect(
            offenders,
            `Remove \`export type { ... }\` from server-action files: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});
