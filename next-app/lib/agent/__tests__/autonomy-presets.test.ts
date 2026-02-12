import { describe, it, expect } from "vitest";
import { PRESET_LEVELS } from "../autonomy-presets";
import { HARD_CAPS } from "@/types/agent";

describe("PRESET_LEVELS", () => {
    it("defines all four presets", () => {
        expect(Object.keys(PRESET_LEVELS).sort()).toEqual(
            ["assisted", "autonomous", "custom", "manual"],
        );
    });

    it("manual preset sets all tools to level 1", () => {
        for (const level of Object.values(PRESET_LEVELS.manual)) {
            expect(level).toBe(1);
        }
    });

    it("custom preset is an empty object", () => {
        expect(PRESET_LEVELS.custom).toEqual({});
    });

    const EXPECTED_TOOLS = [
        "search_pubmed", "extract_pdf", "add_to_ledger", "exclude_study",
        "update_note", "update_criteria", "bulk_screening",
        "retrieve_memory", "create_note", "store_memory",
    ];

    it("all expected tools are present in each non-custom preset", () => {
        for (const preset of ["manual", "assisted", "autonomous"] as const) {
            const tools = Object.keys(PRESET_LEVELS[preset]).sort();
            expect(tools).toEqual(EXPECTED_TOOLS.sort());
        }
    });

    it("no preset exceeds hard caps", () => {
        for (const [preset, tools] of Object.entries(PRESET_LEVELS)) {
            if (preset === "custom") continue;
            for (const [tool, level] of Object.entries(tools)) {
                const cap = HARD_CAPS[tool];
                if (cap !== undefined) {
                    expect(level, `${preset}.${tool} (level ${level}) exceeds hard cap ${cap}`)
                        .toBeLessThanOrEqual(cap);
                }
            }
        }
    });

    it("autonomous levels are >= assisted levels for every tool", () => {
        for (const tool of EXPECTED_TOOLS) {
            expect(
                PRESET_LEVELS.autonomous[tool],
                `autonomous.${tool} should be >= assisted.${tool}`,
            ).toBeGreaterThanOrEqual(PRESET_LEVELS.assisted[tool]);
        }
    });

    it("assisted levels are >= manual levels for every tool", () => {
        for (const tool of EXPECTED_TOOLS) {
            expect(
                PRESET_LEVELS.assisted[tool],
                `assisted.${tool} should be >= manual.${tool}`,
            ).toBeGreaterThanOrEqual(PRESET_LEVELS.manual[tool]);
        }
    });

    it("all levels are in the valid range 0-4", () => {
        for (const [preset, tools] of Object.entries(PRESET_LEVELS)) {
            if (preset === "custom") continue;
            for (const [tool, level] of Object.entries(tools)) {
                expect(level, `${preset}.${tool}`).toBeGreaterThanOrEqual(0);
                expect(level, `${preset}.${tool}`).toBeLessThanOrEqual(4);
            }
        }
    });
});
