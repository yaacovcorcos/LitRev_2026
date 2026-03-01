import { describe, it, expect } from "vitest";
import { buildSearchPlan, formatSearchPlanAsTask } from "@/lib/agent/query-planner";
import type { SearchIntent } from "@/lib/agent/query-planner";

describe("buildSearchPlan", () => {
    it("builds PICO-structured PubMed query from protocol context", () => {
        const intent: SearchIntent = {
            rawTask: "Find studies on SGLT2 inhibitors for heart failure",
            pico: {
                population: "adults with heart failure",
                intervention: "SGLT2 inhibitors",
                outcome: "cardiovascular mortality",
            },
        };

        const plan = buildSearchPlan(intent);

        expect(plan.objective).toContain("PICO");
        expect(plan.pubmedQueries.length).toBeGreaterThanOrEqual(1);

        // First query should be PICO-structured
        const picoQuery = plan.pubmedQueries[0];
        expect(picoQuery.label).toBe("PICO-structured search");
        expect(picoQuery.query).not.toContain("[MeSH]");
        expect(picoQuery.query).toContain("[tiab]");
        expect(picoQuery.query).toContain("AND");
        expect(picoQuery.query).toContain("adults with heart failure");
        expect(picoQuery.query).toContain("SGLT2 inhibitors");
        expect(picoQuery.query).toContain("cardiovascular mortality");
    });

    it("builds concept-based query when no PICO available", () => {
        const intent: SearchIntent = {
            rawTask: "statin therapy elderly patients cardiovascular outcomes",
        };

        const plan = buildSearchPlan(intent);

        expect(plan.objective).toContain("statin therapy");
        expect(plan.pubmedQueries.length).toBeGreaterThanOrEqual(1);
        expect(plan.pubmedQueries[0].label).toBe("Core concept search");
        expect(plan.pubmedQueries[0].query).toContain("[tiab]");
    });

    it("generates Semantic Scholar queries", () => {
        const intent: SearchIntent = {
            rawTask: "machine learning diagnosis cancer",
        };

        const plan = buildSearchPlan(intent);

        expect(plan.semanticScholarQueries.length).toBeGreaterThanOrEqual(1);
        const ssQuery = plan.semanticScholarQueries[0];
        expect(ssQuery.label).toBe("Primary keyword search");
        // SS queries should NOT contain MeSH/Boolean syntax
        expect(ssQuery.query).not.toContain("[MeSH]");
        expect(ssQuery.query).not.toContain("[tiab]");
    });

    it("adds PICO keyword query to Semantic Scholar when PICO is available", () => {
        const intent: SearchIntent = {
            rawTask: "Find RCTs on diabetes treatment",
            pico: {
                population: "type 2 diabetes",
                intervention: "metformin",
                outcome: "HbA1c reduction",
            },
        };

        const plan = buildSearchPlan(intent);

        // Should have at least 2 SS queries: primary + PICO
        const picoSsQuery = plan.semanticScholarQueries.find(q => q.label === "PICO keyword search");
        expect(picoSsQuery).toBeDefined();
        expect(picoSsQuery!.query).toContain("type 2 diabetes");
        expect(picoSsQuery!.query).toContain("metformin");
    });

    it("detects study design filters from task text", () => {
        const intent: SearchIntent = {
            rawTask: "Find randomized controlled trials on aspirin for stroke prevention",
        };

        const plan = buildSearchPlan(intent);

        expect(plan.pubmedQueries.length).toBeGreaterThanOrEqual(1);
        const query = plan.pubmedQueries[0].query;
        expect(query).toContain("Randomized Controlled Trial[pt]");
    });

    it("applies year range to PubMed queries", () => {
        const intent: SearchIntent = {
            rawTask: "diabetes treatment studies",
            yearRange: { start: 2020, end: 2024 },
        };

        const plan = buildSearchPlan(intent);

        expect(plan.pubmedQueries.length).toBeGreaterThanOrEqual(1);
        expect(plan.pubmedQueries[0].query).toContain("2020:2024[dp]");
    });

    it("applies year range to Semantic Scholar queries", () => {
        const intent: SearchIntent = {
            rawTask: "diabetes treatment studies",
            yearRange: { start: 2020, end: 2024 },
        };

        const plan = buildSearchPlan(intent);

        expect(plan.semanticScholarQueries.length).toBeGreaterThanOrEqual(1);
        expect(plan.semanticScholarQueries[0].yearRange).toBe("2020-2024");
    });

    it("handles open-ended year ranges", () => {
        const intent: SearchIntent = {
            rawTask: "recent AI studies",
            yearRange: { start: 2022 },
        };

        const plan = buildSearchPlan(intent);

        if (plan.semanticScholarQueries.length > 0) {
            expect(plan.semanticScholarQueries[0].yearRange).toBe("2022-");
        }
        if (plan.pubmedQueries.length > 0) {
            expect(plan.pubmedQueries[0].query).toContain("2022:2099[dp]");
        }
    });

    it("includes exclusion criteria in strategy notes", () => {
        const intent: SearchIntent = {
            rawTask: "diabetes studies",
            criteria: {
                exclusion: ["animal studies", "case reports", "non-English"],
            },
        };

        const plan = buildSearchPlan(intent);

        const exclusionNote = plan.strategyNotes.find(n => n.includes("Exclusion criteria"));
        expect(exclusionNote).toBeDefined();
        expect(exclusionNote).toContain("animal studies");
        expect(exclusionNote).toContain("non-English");
    });

    it("includes inclusion criteria in strategy notes", () => {
        const intent: SearchIntent = {
            rawTask: "diabetes studies",
            criteria: {
                inclusion: ["adults 18+", "English language"],
            },
        };

        const plan = buildSearchPlan(intent);

        const inclusionNote = plan.strategyNotes.find(n => n.includes("Inclusion criteria"));
        expect(inclusionNote).toBeDefined();
        expect(inclusionNote).toContain("adults 18+");
    });

    it("avoids false-positive RCT detection from substring matches", () => {
        const intent: SearchIntent = {
            rawTask: "find data extraction methods for adverse-event reporting",
        };

        const plan = buildSearchPlan(intent);

        for (const q of plan.pubmedQueries) {
            expect(q.query).not.toContain("Randomized Controlled Trial[pt]");
        }
    });

    it("sanitizes quoted PICO values before building PubMed syntax", () => {
        const intent: SearchIntent = {
            rawTask: "find trials",
            pico: {
                population: "\"adults with heart failure\"",
                intervention: "\"standard of care\"",
                outcome: "\"mortality\"",
            },
        };

        const plan = buildSearchPlan(intent);
        const query = plan.pubmedQueries[0]?.query ?? "";
        expect(query).not.toContain("\"\"");
        expect(query).toContain("[tiab]");
    });

    it("does not duplicate concept groups for repeated terms", () => {
        const intent: SearchIntent = {
            rawTask: "diabetes diabetes diabetes treatment",
        };

        const plan = buildSearchPlan(intent);

        // Count occurrences of "diabetes[tiab]" in the first PubMed query
        const query = plan.pubmedQueries[0]?.query ?? "";
        const tiabMatches = query.match(/diabetes\[tiab\]/gi) ?? [];
        expect(tiabMatches.length).toBeLessThanOrEqual(1);
    });

    it("handles empty task gracefully", () => {
        const intent: SearchIntent = {
            rawTask: "the and or for",
        };

        const plan = buildSearchPlan(intent);

        // Should still produce a valid plan (possibly empty queries)
        expect(plan).toBeDefined();
        expect(plan.objective).toBeDefined();
    });
});

describe("formatSearchPlanAsTask", () => {
    it("formats a plan into structured markdown for the sub-agent", () => {
        const intent: SearchIntent = {
            rawTask: "Find RCTs on SGLT2 inhibitors in heart failure",
            pico: {
                population: "heart failure patients",
                intervention: "SGLT2 inhibitors",
                outcome: "mortality",
            },
        };

        const plan = buildSearchPlan(intent);
        const formatted = formatSearchPlanAsTask(plan);

        expect(formatted).toContain("## Search Objective");
        expect(formatted).toContain("## PubMed Queries");
        expect(formatted).toContain("## Semantic Scholar Queries");
        expect(formatted).toContain("## Strategy Notes");
        expect(formatted).toContain("## Instructions");
        expect(formatted).toContain("Execute the queries above");
    });

    it("includes PubMed query syntax in formatted output", () => {
        const intent: SearchIntent = {
            rawTask: "diabetes treatment",
            pico: { population: "type 2 diabetes", intervention: "metformin" },
        };

        const plan = buildSearchPlan(intent);
        const formatted = formatSearchPlanAsTask(plan);

        // Should contain the actual query with field-tag syntax
        expect(formatted).toContain("[tiab]");
    });
});
