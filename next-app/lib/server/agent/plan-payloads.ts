import "server-only";

import type { AgentMode } from "@/types/agent";
import type { PlanExecutionMetadata, PlanPayload } from "@/types/artifacts";

type BuildExecutionMetadataInput = {
    originAgentMode: AgentMode;
    conversationId: string | null;
    projectId: string | null;
};

export function buildExecutablePlanPayload(
    basePlan: PlanPayload,
    input: BuildExecutionMetadataInput,
): PlanPayload {
    const allowedToolNames = Array.from(
        new Set(
            basePlan.steps
                .map((step) => step.toolName?.trim())
                .filter((toolName): toolName is string => Boolean(toolName)),
        ),
    );

    return {
        ...basePlan,
        execution: {
            originAgentMode: input.originAgentMode,
            allowedToolNames,
            createdFromConversationId: input.conversationId,
            createdFromProjectId: input.projectId,
            enforceOrder: true,
        },
    };
}

export function isExecutablePlanPayload(
    payload: PlanPayload,
): payload is PlanPayload & { execution: PlanExecutionMetadata } {
    return Boolean(payload.execution);
}
