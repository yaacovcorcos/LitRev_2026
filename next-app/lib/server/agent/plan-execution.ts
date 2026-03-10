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
import { AIErrorWithEnvelope, createPlanExecutionErrorEnvelope } from "@/lib/ai/error-envelope";
import { isExecutablePlanPayload } from "@/lib/server/agent/plan-payloads";

export interface SelectedStep {
    originalIndex: number;
    label: string;
    toolName?: string;
    description?: string;
}

export interface PlanExecutionStepState {
    originalIndex: number;
    label: string;
    toolName: string;
    consumed: boolean;
    finalStatus: PlanStep["status"];
}

export interface PreparedPlanExecution {
    plan: PlanPayload & { execution: PlanExecutionMetadata };
    selectedSteps: SelectedStep[];
    conversationId: string | null;
    projectId: string | null;
    originAgentMode: PlanExecutionMetadata["originAgentMode"];
    allowedToolNames: string[];
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
        throw new AIErrorWithEnvelope(createPlanExecutionErrorEnvelope({
            code: "PLAN_ARTIFACT_TYPE_INVALID",
            message: "Only plan artifacts can be executed.",
        }));
    }

    const parsed = PlanSchema.safeParse(artifact.payload);
    if (!parsed.success) {
        throw new AIErrorWithEnvelope(createPlanExecutionErrorEnvelope({
            code: "PLAN_PAYLOAD_INVALID",
            message: `The saved plan payload is invalid: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        }));
    }

    return {
        artifact,
        payload: parsed.data as PlanPayload,
    };
}

function throwPlanExecutionError(code: string, message: string): never {
    throw new AIErrorWithEnvelope(createPlanExecutionErrorEnvelope({ code, message }));
}

function buildSelectedSteps(payload: PlanPayload, selectedStepIndexes: number[]): SelectedStep[] {
    const selectedSteps = selectedStepIndexes
        .filter((i) => i >= 0 && i < payload.steps.length)
        .map((i) => ({ originalIndex: i, ...payload.steps[i] }));

    if (selectedSteps.length === 0) {
        throwPlanExecutionError("PLAN_NO_VALID_SELECTED_STEPS", "No valid plan steps were selected for execution.");
    }

    const nonExecutable = selectedSteps.filter((step) => !step.toolName);
    if (nonExecutable.length > 0) {
        throwPlanExecutionError(
            "PLAN_STEP_NOT_EXECUTABLE",
            "Selected plan includes step(s) without an executable tool.",
        );
    }

    return selectedSteps;
}

export async function preparePlanExecution(
    planId: string,
    selectedStepIndexes: number[],
    expectedProjectId?: string | null,
): Promise<PreparedPlanExecution> {
    const { artifact, payload } = await loadParsedPlanArtifact(planId);

    if (!isExecutablePlanPayload(payload)) {
        throwPlanExecutionError(
            "PLAN_EXECUTION_METADATA_MISSING",
            "This plan is advisory-only and cannot be executed. Generate a fresh executable plan instead.",
        );
    }

    const projectId = payload.execution.createdFromProjectId ?? artifact.projectId ?? null;
    if (expectedProjectId && projectId && projectId !== expectedProjectId) {
        throwPlanExecutionError(
            "PLAN_PROJECT_MISMATCH",
            "Plan does not belong to the current project context.",
        );
    }

    const selectedSteps = buildSelectedSteps(payload, selectedStepIndexes);

    return {
        plan: payload,
        selectedSteps,
        conversationId: payload.execution.createdFromConversationId ?? artifact.conversationId,
        projectId,
        originAgentMode: payload.execution.originAgentMode,
        allowedToolNames: payload.execution.allowedToolNames,
    };
}

export async function markPlanExecutionRunning(planId: string): Promise<void> {
    const updated = await prisma.artifact.updateMany({
        where: { id: planId, status: "proposed", type: "plan" },
        data: { status: "running" },
    });
    if (updated.count === 0) {
        throwPlanExecutionError(
            "PLAN_ALREADY_RUNNING",
            "Plan could not be started because it is no longer in a runnable proposed state.",
        );
    }
}

export function resolvePlanExecutionToolNames(params: {
    selectedSteps: SelectedStep[];
    storedAllowedToolNames: string[];
    currentAllowedToolNames: string[];
}): {
    allowedToolNames: string[];
    unavailableToolNames: string[];
} {
    const selectedToolNames = Array.from(
        new Set(
            params.selectedSteps
                .map((step) => step.toolName)
                .filter((toolName): toolName is string => Boolean(toolName)),
        ),
    );
    const storedAllowed = new Set(params.storedAllowedToolNames);
    const currentAllowed = new Set(params.currentAllowedToolNames);

    return {
        allowedToolNames: selectedToolNames.filter(
            (toolName) => storedAllowed.has(toolName) && currentAllowed.has(toolName),
        ),
        unavailableToolNames: selectedToolNames.filter(
            (toolName) => !storedAllowed.has(toolName) || !currentAllowed.has(toolName),
        ),
    };
}

export function assertNextPlanToolCall(
    stepQueue: PlanExecutionStepState[],
    toolName: string,
): PlanExecutionStepState {
    const nextExpected = stepQueue.find((step) => !step.consumed);
    if (!nextExpected) {
        throwPlanExecutionError(
            "PLAN_EXTRA_TOOL_CALL",
            `The approved plan is already complete, but the model attempted to run "${toolName}".`,
        );
    }

    if (toolName !== nextExpected.toolName) {
        const plannedLater = stepQueue.some(
            (step) => !step.consumed && step.toolName === toolName,
        );
        throwPlanExecutionError(
            plannedLater ? "PLAN_STEP_OUT_OF_ORDER" : "PLAN_TOOL_NOT_APPROVED",
            plannedLater
                ? `Plan execution must run step ${nextExpected.originalIndex + 1} (${nextExpected.label}) before "${toolName}".`
                : `Tool "${toolName}" is not approved for this plan execution. Next approved step is ${nextExpected.originalIndex + 1} (${nextExpected.label}).`,
        );
    }

    return nextExpected;
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
): Promise<PreparedPlanExecution> {
    const prepared = await preparePlanExecution(planId, selectedStepIndexes, expectedProjectId);
    await markPlanExecutionRunning(planId);
    return prepared;
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
