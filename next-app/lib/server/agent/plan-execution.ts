/**
 * Plan Execution Lifecycle
 * Dedicated functions for starting, completing, and failing plan execution.
 * Separate from reviewArtifact/applyArtifact — plan execution is a run lifecycle
 * transition, not a human review transition.
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import { PlanSchema, type PlanPayload, type PlanStep, type PlanExecutionMetadata } from "@/types/artifacts";
import { isExecutablePlanPayload } from "@/lib/server/agent/plan-payloads";

export interface SelectedStep {
    originalIndex: number;
    label: string;
    toolName?: string;
    description?: string;
}

interface ParsedPlanArtifact {
    artifact: {
        id: string;
        type: string;
        status: string;
        projectId: string | null;
        conversationId: string | null;
        payload: Prisma.JsonValue;
    };
    payload: PlanPayload;
}

async function loadParsedPlanArtifact(planId: string): Promise<ParsedPlanArtifact> {
    const artifact = await prisma.artifact.findUniqueOrThrow({ where: { id: planId } });
    if (artifact.type !== "plan") {
        throw new Error("Artifact is not an executable plan");
    }

    const parsed = PlanSchema.safeParse(artifact.payload);
    if (!parsed.success) {
        throw new Error(`Invalid plan payload: ${parsed.error.issues.map(i => i.message).join("; ")}`);
    }

    return {
        artifact,
        payload: parsed.data as PlanPayload,
    };
}

/**
 * Validate plan and atomically set status to "running".
 * Returns selected steps + conversationId for correct conversation targeting.
 *
 * Uses updateMany with WHERE status='proposed' for atomic transition —
 * prevents double-start races from concurrent clicks/sessions.
 */
export async function startPlanExecution(
    planId: string,
    selectedStepIndexes: number[],
    expectedProjectId?: string | null,
): Promise<{
    plan: PlanPayload;
    selectedSteps: SelectedStep[];
    conversationId: string | null;
    projectId: string | null;
    originAgentMode: PlanExecutionMetadata["originAgentMode"];
    allowedToolNames: string[];
}> {
    const { artifact, payload } = await loadParsedPlanArtifact(planId);

    if (expectedProjectId && artifact.projectId && artifact.projectId !== expectedProjectId) {
        throw new Error("Plan does not belong to the expected project");
    }
    if (!isExecutablePlanPayload(payload)) {
        throw new Error("Plan is advisory-only and cannot be executed");
    }

    // Atomic conditional update: proposed → running
    const updated = await prisma.artifact.updateMany({
        where: { id: planId, status: "proposed", type: "plan" },
        data: { status: "running" },
    });
    if (updated.count === 0) {
        throw new Error("Plan not found or already running");
    }

    const selectedSteps = selectedStepIndexes
        .filter(i => i >= 0 && i < payload.steps.length)
        .map(i => ({ originalIndex: i, ...payload.steps[i] }));
    if (selectedSteps.length === 0) {
        await prisma.artifact.update({ where: { id: planId }, data: { status: "proposed" } });
        throw new Error("No valid steps selected");
    }
    const nonExecutable = selectedSteps.filter((step) => !step.toolName);
    if (nonExecutable.length > 0) {
        await prisma.artifact.update({ where: { id: planId }, data: { status: "proposed" } });
        throw new Error("Selected plan includes non-executable step(s) without toolName");
    }

    return {
        plan: payload,
        selectedSteps,
        conversationId: artifact.conversationId,
        projectId: artifact.projectId,
        originAgentMode: payload.execution.originAgentMode,
        allowedToolNames: payload.execution.allowedToolNames,
    };
}

/**
 * Persist final step statuses to artifact payload, then mark completed.
 * Called after all selected steps completed successfully.
 */
export async function completePlanExecution(
    planId: string,
    finalSteps: PlanStep[],
): Promise<void> {
    const { payload } = await loadParsedPlanArtifact(planId);

    await prisma.artifact.update({
        where: { id: planId },
        data: {
            status: "accepted",
            payload: { ...payload, steps: finalSteps } as unknown as Prisma.InputJsonValue,
            reviewedAt: new Date(),
            appliedAt: new Date(),
        },
    });
}

/**
 * Persist final step statuses to artifact payload, then revert to proposed (retryable).
 * Called on error, cancellation, or when any selected step failed.
 */
export async function failPlanExecution(
    planId: string,
    finalSteps: PlanStep[],
    reason?: string,
): Promise<void> {
    const { payload } = await loadParsedPlanArtifact(planId);

    await prisma.artifact.update({
        where: { id: planId },
        data: {
            status: "proposed",
            payload: { ...payload, steps: finalSteps } as unknown as Prisma.InputJsonValue,
            reviewNote: reason ? `Execution failed: ${reason}` : null,
        },
    });
}
