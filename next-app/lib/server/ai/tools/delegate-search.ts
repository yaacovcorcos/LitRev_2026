/**
 * delegate_search Meta-Tool
 * Delegates a literature search task to a specialized search sub-agent.
 * The sub-agent defaults to PubMed-only search. OpenAlex and Semantic Scholar
 * are exposed only when the parent user explicitly names those sources.
 *
 * When PICO context is available, the query planner (CAG-008) generates
 * structured Boolean + field-tag queries for PubMed. Semantic Scholar query
 * planning remains explicit-source only. The sub-agent receives a structured
 * plan instead of raw natural language.
 *
 * (Wave 2 — CAG-011, Wave 4 — CAG-008)
 */

import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { executeSubAgent } from "../sub-agent";
import { buildSearchPlan, formatSearchPlanAsTask } from "@/lib/agent/query-planner";
import type { SearchIntent } from "@/lib/agent/query-planner";
import { isDelegationEnabled } from "@/lib/agent/feature-flags";

function parseOptionalYear(value: unknown): number | undefined {
    if (typeof value !== "string" && typeof value !== "number") return undefined;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

const inputSchema = z.object({
    task: z.string().min(1).max(2000),
    pico: z.object({
        population: z.string().optional(),
        intervention: z.string().optional(),
        comparison: z.string().optional(),
        outcome: z.string().optional(),
    }).optional(),
    criteria: z.object({
        inclusion: z.array(z.string().min(1).max(500)).max(50).optional(),
        exclusion: z.array(z.string().min(1).max(500)).max(50).optional(),
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
            "The search agent uses PubMed by default, can add studies to the ledger, " +
            "and can find recommended studies. OpenAlex and Semantic Scholar are available only " +
            "when the user names those sources explicitly. Use this when the user asks to find, search for, " +
            "or discover studies on a topic. Provide a clear task description. " +
            "Optionally pass PICO/criteria elements to enable structured query planning with PubMed field tags.",
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
                criteria: {
                    type: "object",
                    description: "Eligibility criteria to guide candidate selection after search retrieval.",
                    properties: {
                        inclusion: {
                            type: "array",
                            items: { type: "string" },
                            description: "Inclusion criteria list.",
                        },
                        exclusion: {
                            type: "array",
                            items: { type: "string" },
                            description: "Exclusion criteria list.",
                        },
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
        if (!isDelegationEnabled()) {
            return {
                callId: "",
                result: null,
                error: "Delegation tools are disabled by feature flag.",
            };
        }

        const task = args.task as string;
        const argPico = args.pico as SearchIntent["pico"] | undefined;
        const argCriteria = args.criteria as SearchIntent["criteria"] | undefined;
        const argYearStart = args.yearStart as number | undefined;
        const argYearEnd = args.yearEnd as number | undefined;

        const protocolData = context?.protocolData;
        const protocolPico: SearchIntent["pico"] | undefined = protocolData
            ? {
                population: protocolData.pico.population || undefined,
                intervention: protocolData.pico.intervention || undefined,
                comparison: protocolData.pico.comparison || undefined,
                outcome: protocolData.pico.outcome || undefined,
            }
            : undefined;
        const protocolCriteria: SearchIntent["criteria"] | undefined = protocolData
            ? {
                inclusion: protocolData.eligibility.inclusion,
                exclusion: protocolData.eligibility.exclusion,
            }
            : undefined;

        const parsedStart = parseOptionalYear(protocolData?.methodology?.timeFrameStart);
        const parsedEnd = parseOptionalYear(protocolData?.methodology?.timeFrameEnd);
        const yearStart = argYearStart ?? (Number.isFinite(parsedStart) ? parsedStart : undefined);
        const yearEnd = argYearEnd ?? (Number.isFinite(parsedEnd) ? parsedEnd : undefined);

        const pico = argPico ?? protocolPico;
        const criteria = argCriteria ?? protocolCriteria;

        // Build structured search plan when we have enough context
        const intent: SearchIntent = {
            rawTask: task,
            pico,
            criteria,
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
            rootRunId: context?.rootRunId,
            conversationId: context?.conversationId,
            autonomyConfig: context?.autonomyConfig,
            systemContexts: context?.systemContexts,
            signal: context?.signal,
            sourcePolicyText: task,
            model: context?.model ?? context?.systemContexts?.selectedModel,
            reasoningEffort: context?.reasoningEffort,
            deliveryMode: context?.deliveryMode,
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
            blockedByAutonomy: result.blockedByAutonomy,
            blockedReason: result.blockedReason,
            requiresUserInput: result.requiresUserInput,
            userInputRequest: result.userInputRequest,
            artifacts: result.artifacts,
        };
    },
};
