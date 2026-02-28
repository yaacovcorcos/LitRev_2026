/**
 * delegate_search Meta-Tool
 * Delegates a literature search task to a specialized search sub-agent.
 * The sub-agent has access to search_pubmed, search_semantic_scholar,
 * add_to_ledger, recommend_studies, and the search mode system prompt.
 *
 * Used from general mode to route search requests through the focused
 * search pipeline instead of giving general mode direct access to
 * all 19+ tools.
 *
 * (Wave 2 — CAG-011)
 */

import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { executeSubAgent } from "../sub-agent";

const inputSchema = z.object({
    task: z.string().min(1).max(2000),
});

const outputSchema = z.object({
    success: z.boolean(),
    summary: z.string(),
    toolCallCount: z.number(),
    stopReason: z.string(),
});

export const delegateSearchTool: AITool = {
    definition: {
        name: "delegate_search",
        description:
            "Delegate a literature search task to a specialized search agent. " +
            "The search agent can query PubMed, Semantic Scholar, add studies to the ledger, " +
            "and find recommended studies. Use this when the user asks to find, search for, " +
            "or discover studies on a topic. Provide a clear task description.",
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

        const result = await executeSubAgent({
            mode: "search",
            task,
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
            },
            error: result.error,
        };
    },
};
