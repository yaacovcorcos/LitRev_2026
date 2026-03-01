/**
 * delegate_protocol Meta-Tool
 * Delegates protocol/criteria updates to a specialized protocol sub-agent.
 * The sub-agent has access to update_protocol, update_criteria, update_study,
 * search tools (for context), and the protocol mode system prompt.
 *
 * Used from general mode to route protocol-related requests through the
 * focused protocol pipeline with appropriate guidance.
 *
 * (Wave 2 — CAG-011)
 */

import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { executeSubAgent } from "../sub-agent";
import { isDelegationEnabled } from "@/lib/agent/feature-flags";

const inputSchema = z.object({
    task: z.string().min(1).max(2000),
});

const outputSchema = z.object({
    success: z.boolean(),
    summary: z.string(),
    toolCallCount: z.number(),
    stopReason: z.string(),
});

export const delegateProtocolTool: AITool = {
    definition: {
        name: "delegate_protocol",
        description:
            "Delegate protocol or criteria updates to a specialized protocol agent. " +
            "The protocol agent can update PICO, inclusion/exclusion criteria, search strategy, " +
            "and methodology settings. Use this when the user asks to define, update, or refine " +
            "the review protocol, research question, or eligibility criteria.",
        parameters: {
            type: "object",
            properties: {
                task: {
                    type: "string",
                    description:
                        "Plain-language description of the protocol task. Specify what to update " +
                        "and any specific values. " +
                        "Example: 'Add an exclusion criterion: studies with fewer than 50 participants'",
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

        const result = await executeSubAgent({
            mode: "protocol",
            task,
            projectId: context?.projectId,
            userId: context?.userId,
            parentRunId: context?.runId,
            systemContexts: context?.systemContexts,
            signal: context?.signal,
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
