import { z } from "zod";

export const EvalSuiteSchema = z.enum(["ask_user", "delegation", "search", "screening"]);
export type EvalSuite = z.infer<typeof EvalSuiteSchema>;

export const EvalScenarioSchema = z.object({
    id: z.string().min(3),
    suite: EvalSuiteSchema,
    title: z.string().min(3),
    prompt: z.string().min(3),
    expectedSignals: z.array(z.string().min(1)).min(1),
});
export type EvalScenario = z.infer<typeof EvalScenarioSchema>;

export const EvalScenarioCatalogSchema = z.array(EvalScenarioSchema);

/**
 * Foundation catalog for Wave 1 eval scaffolding.
 * Later phases can append higher-fidelity scenarios and assertions.
 */
export const CORE_EVAL_SCENARIOS: EvalScenario[] = [
    {
        id: "ask-user-clarify-pico",
        suite: "ask_user",
        title: "Clarify missing PICO via structured prompt",
        prompt: "Search for studies on diabetes treatments.",
        expectedSignals: ["user_input_required"],
    },
    {
        id: "delegation-general-search-route",
        suite: "delegation",
        title: "General mode routes to delegated search flow",
        prompt: "Find recent COPD treatment trials and add relevant studies.",
        expectedSignals: ["tool_call:delegate_search"],
    },
    {
        id: "search-source-provenance",
        suite: "search",
        title: "Search run emits provenance/source receipt",
        prompt: "Find RCTs for yoga and hypertension.",
        expectedSignals: ["source_receipt"],
    },
    {
        id: "screening-decision-audit",
        suite: "screening",
        title: "Screening output includes auditable decision fields",
        prompt: "Screen these studies against my protocol and explain each decision.",
        expectedSignals: ["decision", "rationale", "confidence"],
    },
];

export function parseEvalScenarioCatalog(input: unknown): EvalScenario[] {
    return EvalScenarioCatalogSchema.parse(input);
}

export function assertUniqueScenarioIds(scenarios: EvalScenario[]): void {
    const seen = new Set<string>();
    for (const scenario of scenarios) {
        if (seen.has(scenario.id)) {
            throw new Error(`Duplicate eval scenario id: ${scenario.id}`);
        }
        seen.add(scenario.id);
    }
}

export function listSuites(scenarios: EvalScenario[]): EvalSuite[] {
    return Array.from(new Set(scenarios.map((scenario) => scenario.suite)));
}

