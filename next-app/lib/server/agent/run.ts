/**
 * AgentRun Lifecycle
 * Creates, updates, and completes agent runs (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { AgentMode, RunStatus, RunTrigger } from "@/types/agent";

export interface StartRunInput {
    projectId: string;
    conversationId?: string;
    userId?: string;
    trigger: RunTrigger;
    agentMode: AgentMode;
    model?: string;
}

/**
 * Start a new agent run
 */
export async function startRun(input: StartRunInput) {
    return prisma.agentRun.create({
        data: {
            projectId: input.projectId,
            conversationId: input.conversationId ?? null,
            userId: input.userId ?? null,
            trigger: input.trigger,
            agentMode: input.agentMode,
            status: "running",
            model: input.model ?? null,
        },
    });
}

/**
 * End a run with final status and token counts
 */
export async function endRun(
    runId: string,
    status: Extract<RunStatus, "completed" | "failed" | "cancelled">,
    costTokensIn?: number,
    costTokensOut?: number
) {
    return prisma.agentRun.update({
        where: { id: runId },
        data: {
            status,
            completedAt: new Date(),
            ...(costTokensIn !== undefined ? { costTokensIn } : {}),
            ...(costTokensOut !== undefined ? { costTokensOut } : {}),
        },
    });
}

/**
 * Cancel a running run
 */
export async function cancelRun(runId: string) {
    return endRun(runId, "cancelled");
}

/**
 * Get a run by ID
 */
export async function getRun(runId: string) {
    return prisma.agentRun.findUnique({
        where: { id: runId },
    });
}

/**
 * Get runs for a project
 */
export async function getProjectRuns(
    projectId: string,
    options?: { limit?: number; status?: RunStatus }
) {
    return prisma.agentRun.findMany({
        where: {
            projectId,
            ...(options?.status ? { status: options.status } : {}),
        },
        orderBy: { startedAt: "desc" },
        take: options?.limit ?? 20,
    });
}
