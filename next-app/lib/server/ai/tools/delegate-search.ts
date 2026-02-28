/**
 * delegate_search Meta-Tool
 * Delegates a literature search task to a specialized search sub-agent.
 * The sub-agent has access to search_pubmed, search_semantic_scholar,
 * add_to_ledger, recommend_studies, and the search mode system prompt.
 *
 * When PICO context is available, the query planner (CAG-008) generates
 * structured Boolean + MeSH queries for PubMed and keyword queries for
 * Semantic Scholar. The sub-agent receives a structured plan instead of
 * raw natural language.
 *
 * (Wave 2 — CAG-011, Wave 4 — CAG-008)
 */

import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { executeSubAgent } from "../sub-agent";
import { buildSearchPlan, formatSearchPlanAsTask } from "@/lib/agent/query-planner";
import type { SearchIntent } from "@/lib/agent/query-planner";

const inputSchema = z.object({
    task: z.string().min(1).max(2000),
    pico: z.object({
        population: z.string().optional(),
        intervention: z.string().optional(),
        comparison: z.string().optional(),
        outcome: z.string().optional(),
    }).optional(),
    yearStart: z.number().int().min(1900).max(2100).optional(),
    yearEnd: z.number().int().min(1900).max(2100).optional(),
});

const outputSchema = z.object({
    success: z.boolean(),
    summary: z.string(),
    toolCallCount: z.number(),
    stopReason: z.string(),
    searchPlanUsed: z.boolean(),
});

export const delegateSearchTool: AITool = {
    definition: {
        name: "delegate_search",
        description:
            "Delegate a literature search task to a specialized search agent. " +
            "The search agent can query PubMed, Semantic Scholar, add studies to the ledger, " +
            "and find recommended studies. Use this when the user asks to find, search for, " +
            "or discover studies on a topic. Provide a clear task description. " +
            "Optionally pass PICO elements to enable structured query planning with Boolean and MeSH terms.",
        parameters: {
            type: "object",
            properties: {
                task: {
                    type: "string",
                    description:
                        "Plain-language description of the search task. Include the topic, " +
                        "any specific databases to use, result count preferences, etc. " +
                        "Example: 'Search PubMed for RCTs on SGLT2 inhibitors in heart failure, add top 10 to ledger'",
                },
                pico: {
                    type: "object",
                    description: "PICO elements from the protocol for structured query building. Pass these when available.",
                    properties: {
                        population: { type: "string", description: "Target population (e.g., 'adults with type 2 diabetes')" },
                        intervention: { type: "string", description: "Intervention or exposure (e.g., 'SGLT2 inhibitors')" },
                        comparison: { type: "string", description: "Comparator (e.g., 'placebo')" },
                        outcome: { type: "string", description: "Primary outcome (e.g., 'cardiovascular mortality')" },
                    },
                },
                yearStart: {
                    type: "number",
                    description: "Start year for date range filtering (e.g., 2015)",
                },
                yearEnd: {
                    type: "number",
                    description: "End year for date range filtering (e.g., 2024)",
                },
            },
            required: ["task"],
        },
    },
    inputSchema,
    outputSchema,
    autonomy: {
        defaultLevel: 3,
        allowedRange: [2, 4],
    },
    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const task = args.task as string;
        const pico = args.pico as SearchIntent["pico"] | undefined;
        const yearStart = args.yearStart as number | undefined;
        const yearEnd = args.yearEnd as number | undefined;

        // Build structured search plan when we have enough context
        const intent: SearchIntent = {
            rawTask: task,
            pico,
            yearRange: (yearStart || yearEnd) ? { start: yearStart, end: yearEnd } : undefined,
        };

        const plan = buildSearchPlan(intent);
        const hasPlan = plan.pubmedQueries.length > 0 || plan.semanticScholarQueries.length > 0;

        // Use the structured plan as the sub-agent task when available,
        // fall back to raw task if planning produced nothing useful
        const effectiveTask = hasPlan ? formatSearchPlanAsTask(plan) : task;

        const result = await executeSubAgent({
            mode: "search",
            task: effectiveTask,
            projectId: context?.projectId,
            userId: context?.userId,
            parentRunId: context?.runId,
        });

        return {
            callId: "",
            result: {
                success: !result.error,
                summary: result.summary,
                toolCallCount: result.totalToolCalls,
                stopReason: result.stopReason,
                searchPlanUsed: hasPlan,
            },
            error: result.error,
        };
    },
};
