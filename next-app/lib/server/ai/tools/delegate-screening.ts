/**
 * delegate_screening Meta-Tool
 * Delegates a screening task to a specialized screening sub-agent.
 * The sub-agent has access to bulk_screening, exclude_study, delete_study,
 * fetch_open_pdf, extract_pdf, read_study_content, and the screening mode system prompt.
 *
 * Used from general mode to route screening requests through the focused
 * screening pipeline with appropriate context and tool subset.
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

export const delegateScreeningTool: AITool = {
    definition: {
        name: "delegate_screening",
        description:
            "Delegate a study screening task to a specialized screening agent. " +
            "The screening agent can run bulk screening against criteria, exclude studies, " +
            "fetch open-access PDFs, extract PDFs, and read study content. Use this when the user asks to screen, " +
            "triage, evaluate, or filter studies against criteria.",
        parameters: {
            type: "object",
            properties: {
                task: {
                    type: "string",
                    description:
                        "Plain-language description of the screening task. Specify what to screen " +
                        "and any criteria to apply. " +
                        "Example: 'Screen all unscreened studies against the inclusion/exclusion criteria'",
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
            mode: "screening",
            task,
            projectId: context?.projectId,
            userId: context?.userId,
            studyId: context?.studyId,
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
