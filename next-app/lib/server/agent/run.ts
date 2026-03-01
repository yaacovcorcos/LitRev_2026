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
    parentRunId?: string;
    rootRunId?: string;
    trigger: RunTrigger;
    agentMode: AgentMode;
    model?: string;
}

export interface RunLineageNode {
    id: string;
    projectId: string | null;
    conversationId: string | null;
    userId: string | null;
    parentRunId: string | null;
    rootRunId: string | null;
    trigger: RunTrigger;
    agentMode: AgentMode;
    status: RunStatus;
    model: string | null;
    costTokensIn: number;
    costTokensOut: number;
    startedAt: string;
    completedAt: string | null;
    children: RunLineageNode[];
}

/**
 * Start a new agent run
 */
export async function startRun(input: StartRunInput) {
    let lineageRootRunId = input.rootRunId ?? null;

    if (input.parentRunId && !lineageRootRunId) {
        const parentRun = await prisma.agentRun.findUnique({
            where: { id: input.parentRunId },
            select: { id: true, projectId: true, rootRunId: true },
        });

        if (!parentRun) {
            throw new Error(`Parent run not found: ${input.parentRunId}`);
        }
        if (parentRun.projectId && input.projectId && parentRun.projectId !== input.projectId) {
            throw new Error("Parent run project does not match child run project");
        }

        lineageRootRunId = parentRun.rootRunId ?? parentRun.id;
    }

    return prisma.agentRun.create({
        data: {
            projectId: input.projectId ?? undefined,
            conversationId: input.conversationId ?? undefined,
            userId: input.userId ?? undefined,
            parentRunId: input.parentRunId ?? undefined,
            rootRunId: lineageRootRunId ?? undefined,
            trigger: input.trigger,
            agentMode: input.agentMode,
            status: "running",
            model: input.model ?? undefined,
        },
    });
}

/**
 * End a run with final status and token counts
 */
export async function endRun(
    runId: string,
    status: Extract<RunStatus, "completed" | "failed" | "cancelled" | "paused">,
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

/**
 * Get parent/child run lineage tree for a given run.
 * Uses rootRunId when available and gracefully handles legacy runs
 * where rootRunId is null.
 */
export async function getRunLineage(runId: string): Promise<RunLineageNode | null> {
    const seed = await prisma.agentRun.findUnique({
        where: { id: runId },
        select: { id: true, rootRunId: true },
    });
    if (!seed) return null;

    const rootId = seed.rootRunId ?? seed.id;
    const runs = await prisma.agentRun.findMany({
        where: {
            OR: [
                { id: rootId },
                { rootRunId: rootId },
            ],
        },
        orderBy: { startedAt: "asc" },
    });
    if (runs.length === 0) return null;

    const byId = new Map<string, RunLineageNode>();
    for (const run of runs) {
        byId.set(run.id, {
            id: run.id,
            projectId: run.projectId,
            conversationId: run.conversationId,
            userId: run.userId,
            parentRunId: run.parentRunId ?? null,
            rootRunId: run.rootRunId ?? null,
            trigger: run.trigger as RunTrigger,
            agentMode: run.agentMode as AgentMode,
            status: run.status as RunStatus,
            model: run.model,
            costTokensIn: run.costTokensIn,
            costTokensOut: run.costTokensOut,
            startedAt: run.startedAt.toISOString(),
            completedAt: run.completedAt?.toISOString() ?? null,
            children: [],
        });
    }

    let root = byId.get(rootId) ?? null;
    if (!root) {
        return null;
    }

    for (const node of byId.values()) {
        if (!node.parentRunId) continue;
        const parent = byId.get(node.parentRunId);
        if (!parent) continue;
        parent.children.push(node);
    }

    const sortTree = (node: RunLineageNode): void => {
        node.children.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        for (const child of node.children) {
            sortTree(child);
        }
    };
    sortTree(root);

    return root;
}
