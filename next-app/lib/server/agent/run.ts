/**
 * AgentRun Lifecycle
 * Creates, updates, and completes agent runs (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { AgentMode, RunStatus, RunTrigger } from "@/types/agent";
import { extractMemoriesFromConversation } from "@/lib/server/memory/conversation-extractor";

export interface StartRunInput {
    projectId?: string | null;
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
            conversationId: input.conversationId ?? undefined,
            userId: input.userId ?? undefined,
            trigger: input.trigger,
            agentMode: input.agentMode,
            status: "running",
            model: input.model ?? undefined,
            ...(input.projectId
                ? { project: { connect: { id: input.projectId } } }
                : {}),
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
    const run = await prisma.agentRun.update({
        where: { id: runId },
        data: {
            status,
            completedAt: new Date(),
            ...(costTokensIn !== undefined ? { costTokensIn } : {}),
            ...(costTokensOut !== undefined ? { costTokensOut } : {}),
        },
    });

    // Fire-and-forget: extract memories from completed conversations
    if (status === "completed" && run.conversationId && run.projectId) {
        scheduleMemoryExtraction(run.id, run.conversationId, run.projectId, run.userId ?? undefined)
            .catch((err) => console.error("[conversation-extractor] Failed:", err));
    }

    return run;
}

async function scheduleMemoryExtraction(
    runId: string,
    conversationId: string,
    projectId: string,
    userId?: string,
) {
    const count = await prisma.aIMessage.count({
        where: { conversationId, role: { in: ["user", "assistant"] } },
    });
    if (count >= 5) {
        await extractMemoriesFromConversation(conversationId, projectId, runId, userId);
    }
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
