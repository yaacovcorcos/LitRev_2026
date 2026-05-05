import { describe, expect, it } from "vitest";
import {
    CORE_EVAL_SCENARIOS,
    assertUniqueScenarioIds,
    listSuites,
    parseEvalScenarioCatalog,
} from "@/lib/server/evals/scenario-catalog";

describe("eval scenario catalog foundation", () => {
    it("parses and validates the core scenario catalog", () => {
        const parsed = parseEvalScenarioCatalog(CORE_EVAL_SCENARIOS);
        expect(parsed.length).toBeGreaterThan(0);
    });

    it("enforces globally unique scenario ids", () => {
        expect(() => assertUniqueScenarioIds(CORE_EVAL_SCENARIOS)).not.toThrow();
    });

    it("covers all baseline suites in the foundation catalog", () => {
        const suites = listSuites(CORE_EVAL_SCENARIOS).sort();
        expect(suites).toEqual(["ask_user", "delegation", "runtime", "screening", "search"]);
    });
});
