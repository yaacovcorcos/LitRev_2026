import "server-only";

import { resolveUserInputQuestionId } from "@/lib/ai/user-input";
import { prisma } from "@/lib/server/prisma";
import { recordRunEvent } from "@/lib/server/agent/run-event-recorder";
import type {
    ClarificationFallbackAction,
    ToolResult,
    UserInputRequest,
    UserInputResolution,
} from "@/types/ai";

const GENERAL_CLARIFICATION_MAX_TOTAL = 2;
const GENERAL_CLARIFICATION_MAX_PRE_PROGRESS = 1;
const LINEAGE_EVENT_SCAN_LIMIT = 250;
const CONTINUATION_CONTEXT_MAX_CHARS = 4_000;

type ClarificationLineageRunRecord = {
    id: string;
    conversationId: string | null;
    rootRunId: string | null;
};

type ClarificationLineageEventRecord = {
    runId: string;
    sequence: number;
    type: string;
    payload: unknown;
    toolName: string | null;
    createdAt: Date;
};

export type ClarificationControllerState = {
    totalClarificationCount: number;
    hasDurableProgressSinceLastResolution: boolean;
    lastResolvedDecisionBoundaryKey: string | null;
};

export type ClarificationDecision =
    | {
        allowPause: true;
        nextState: ClarificationControllerState;
      }
    | {
        allowPause: false;
        nextState: ClarificationControllerState;
        toolResult: ToolResult;
        correctiveMessage: string;
        fallbackAction: ClarificationFallbackAction;
        reason: ClarificationSuppressionReason;
      };

export type ClarificationSuppressionReason =
    | "repeat_without_progress"
    | "preprogress_budget_exhausted"
    | "budget_exhausted"
    | "mode_policy_blocked";

export type ClarificationPolicyOverride =
    | {
        allowPause: true;
      }
    | {
        allowPause: false;
        correctiveMessage: string;
        source?: "clarification_runtime_policy" | "scoping_runtime_policy";
      };

export type PendingUserInputSource = {
    sourceRunId: string;
    conversationId: string | null;
    request: UserInputRequest;
    requiredSequence: number;
};

function asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function serializeForPrompt(value: unknown): string {
    const serialized = JSON.stringify(value, null, 2) ?? String(value);
    if (serialized.length <= CONTINUATION_CONTEXT_MAX_CHARS) {
        return serialized;
    }
    return `${serialized.slice(0, CONTINUATION_CONTEXT_MAX_CHARS)}\n... [truncated]`;
}

function isDurableToolProgress(event: ClarificationLineageEventRecord): boolean {
    if (event.type !== "tool_result") return false;
    const payload = asObject(event.payload) as ToolResult | null;
    return Boolean(
        payload?.callId
        && payload.result != null
        && !payload.error
        && !payload.blockedByAutonomy
        && !payload.requiresUserInput,
    );
}

function isDurableArtifactProgress(event: ClarificationLineageEventRecord): boolean {
    return event.type === "artifact_proposed" || event.type === "artifact_reviewed";
}

function isDurableClarificationProgress(event: ClarificationLineageEventRecord): boolean {
    return isDurableToolProgress(event) || isDurableArtifactProgress(event);
}

function canSurfaceBoundedTerminalDecision(userInputRequest: UserInputRequest): boolean {
    if (Array.isArray(userInputRequest.options) && userInputRequest.options.length > 0) {
        return true;
    }
    return userInputRequest.questionType !== "free_text";
}

function selectClarificationFallbackAction(userInputRequest: UserInputRequest): ClarificationFallbackAction {
    if (userInputRequest.recommendedAnswer?.trim()) {
        return "use_recommended_default";
    }
    if (canSurfaceBoundedTerminalDecision(userInputRequest)) {
        return "bounded_terminal_decision";
    }
    return "truthful_stop";
}

export function resolveDecisionBoundaryKey(params: {
    decisionBoundaryKey?: string | null;
    question: string;
}): string {
    const explicit = params.decisionBoundaryKey?.trim();
    if (explicit) return explicit;
    return params.question
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);
}

export async function hydrateClarificationControllerState(params: {
    sourceRunId?: string | null;
}): Promise<ClarificationControllerState> {
    if (!params.sourceRunId) {
        return {
            totalClarificationCount: 0,
            hasDurableProgressSinceLastResolution: true,
            lastResolvedDecisionBoundaryKey: null,
        };
    }

    const sourceRun = await prisma.agentRun.findUnique({
        where: { id: params.sourceRunId },
        select: {
            id: true,
            conversationId: true,
            rootRunId: true,
        },
    }) as ClarificationLineageRunRecord | null;

    if (!sourceRun) {
        return {
            totalClarificationCount: 0,
            hasDurableProgressSinceLastResolution: true,
            lastResolvedDecisionBoundaryKey: null,
        };
    }

    const lineageRootRunId = sourceRun.rootRunId ?? sourceRun.id;
    const lineageRuns = await prisma.agentRun.findMany({
        where: {
            OR: [
                { id: lineageRootRunId },
                { rootRunId: lineageRootRunId },
            ],
        },
        select: { id: true },
    });

    const runIds = lineageRuns.map((run) => run.id);
    if (runIds.length === 0) {
        return {
            totalClarificationCount: 0,
            hasDurableProgressSinceLastResolution: true,
            lastResolvedDecisionBoundaryKey: null,
        };
    }

    const events = await prisma.runEvent.findMany({
        where: {
            runId: { in: runIds },
            type: {
                in: [
                    "user_input_required",
                    "user_input_resolved",
                    "tool_result",
                    "artifact_proposed",
                    "artifact_reviewed",
                ],
            },
        },
        orderBy: [{ createdAt: "desc" }, { sequence: "desc" }],
        take: LINEAGE_EVENT_SCAN_LIMIT,
        select: {
            runId: true,
            sequence: true,
            type: true,
            payload: true,
            toolName: true,
            createdAt: true,
        },
    }) as ClarificationLineageEventRecord[];

    let totalClarificationCount = 0;
    let hasDurableProgressSinceLastResolution = true;
    let lastResolvedDecisionBoundaryKey: string | null = null;
    let sawClarificationEvent = false;
    let sawLatestResolvedClarification = false;
    let sawNewerDurableProgress = false;

    // Walk newest -> oldest and stop once we cross the next older durable-progress
    // boundary after entering a clarification segment. Older windows should not
    // influence the current suppression policy.
    for (const event of events) {
        if (isDurableClarificationProgress(event)) {
            if (sawClarificationEvent) {
                break;
            }
            sawNewerDurableProgress = true;
            continue;
        }

        if (event.type === "user_input_required") {
            totalClarificationCount += 1;
            sawClarificationEvent = true;
            continue;
        }

        if (event.type === "user_input_resolved") {
            sawClarificationEvent = true;
            if (!sawLatestResolvedClarification) {
                const payload = asObject(event.payload) as UserInputResolution | null;
                sawLatestResolvedClarification = true;
                hasDurableProgressSinceLastResolution = sawNewerDurableProgress;
                lastResolvedDecisionBoundaryKey = payload?.decisionBoundaryKey ?? null;
            }
        }
    }

    return {
        totalClarificationCount,
        hasDurableProgressSinceLastResolution,
        lastResolvedDecisionBoundaryKey,
    };
}

export function markClarificationProgress(
    state: ClarificationControllerState,
): ClarificationControllerState {
    if (state.hasDurableProgressSinceLastResolution) return state;
    return {
        ...state,
        hasDurableProgressSinceLastResolution: true,
    };
}

function buildSuppressedClarificationToolResult(params: {
    decisionBoundaryKey: string;
    reason: ClarificationSuppressionReason;
    fallbackAction: ClarificationFallbackAction;
    userInputRequest: UserInputRequest;
    source?: "clarification_runtime_policy" | "scoping_runtime_policy";
}): ToolResult {
    return {
        callId: `ask_user_suppressed_${params.reason}`,
        result: {
            status: params.fallbackAction === "use_recommended_default"
                ? "clarification_resolved_by_runtime_default"
                : params.fallbackAction === "bounded_terminal_decision"
                    ? "clarification_terminal_decision_required"
                    : "clarification_truthful_stop_required",
            source: params.source ?? "clarification_runtime_policy",
            reason: params.reason,
            decisionBoundaryKey: params.decisionBoundaryKey,
            fallbackAction: params.fallbackAction,
            recommendedAnswer: params.userInputRequest.recommendedAnswer ?? null,
            question: params.userInputRequest.question,
            questionType: params.userInputRequest.questionType,
            options: params.userInputRequest.options ?? null,
            resolvedAnswer: params.fallbackAction === "use_recommended_default"
                ? params.userInputRequest.recommendedAnswer?.trim() ?? null
                : null,
        },
    };
}

function buildSuppressedClarificationMessage(params: {
    reason: ClarificationSuppressionReason;
    fallbackAction: ClarificationFallbackAction;
    userInputRequest: UserInputRequest;
}): string {
    const recommendedDefault = params.userInputRequest.recommendedAnswer?.trim();
    const fallbackInstruction = params.fallbackAction === "use_recommended_default"
        ? `Treat the recommended default "${recommendedDefault}" as authoritative runtime input and continue without asking again.`
        : params.fallbackAction === "bounded_terminal_decision"
            ? "Present exactly one bounded terminal decision point in the visible assistant response and do not call ask_user again in this run."
            : "Stop truthfully now, explain that the missing decision blocks safe progress, and do not call ask_user again in this run.";

    if (params.reason === "repeat_without_progress") {
        return `Do not ask the same blocking clarification again before making durable progress. Treat the prior clarification state as authoritative. ${fallbackInstruction}`;
    }

    if (params.reason === "preprogress_budget_exhausted" || params.reason === "mode_policy_blocked") {
        return `Do not ask another blocking clarification before making durable progress. ${fallbackInstruction}`;
    }

    return `Do not ask another blocking clarification in this run. ${fallbackInstruction}`;
}

function buildClarificationSuppressionDecision(params: {
    state: ClarificationControllerState;
    decisionBoundaryKey: string;
    reason: ClarificationSuppressionReason;
    userInputRequest: UserInputRequest;
    correctiveMessage?: string;
    source?: "clarification_runtime_policy" | "scoping_runtime_policy";
}): ClarificationDecision {
    const fallbackAction = selectClarificationFallbackAction(params.userInputRequest);
    return {
        allowPause: false,
        nextState: params.state,
        fallbackAction,
        reason: params.reason,
        toolResult: buildSuppressedClarificationToolResult({
            decisionBoundaryKey: params.decisionBoundaryKey,
            reason: params.reason,
            fallbackAction,
            userInputRequest: params.userInputRequest,
            source: params.source,
        }),
        correctiveMessage: params.correctiveMessage ?? buildSuppressedClarificationMessage({
            reason: params.reason,
            fallbackAction,
            userInputRequest: params.userInputRequest,
        }),
    };
}

export function buildClarificationResolutionUserMessage(params: {
    userMessage?: string | null;
    request: UserInputRequest;
    resolution: UserInputResolution;
}): string {
    const explicit = params.userMessage?.trim();
    if (explicit) return explicit;

    const resolvedAnswer = params.resolution.answerText?.trim();
    if (resolvedAnswer) return resolvedAnswer;

    if (params.resolution.resolution === "accept_recommended" && params.request.recommendedAnswer?.trim()) {
        return params.request.recommendedAnswer.trim();
    }

    return "Continue using the resolved clarification.";
}

export function evaluateClarificationRequest(params: {
    state: ClarificationControllerState;
    userInputRequest: UserInputRequest;
    policyOverride?: ClarificationPolicyOverride;
}): ClarificationDecision {
    const decisionBoundaryKey = resolveDecisionBoundaryKey({
        decisionBoundaryKey: params.userInputRequest.decisionBoundaryKey ?? null,
        question: params.userInputRequest.question,
    });

    if (params.policyOverride && !params.policyOverride.allowPause) {
        return buildClarificationSuppressionDecision({
            state: params.state,
            decisionBoundaryKey,
            reason: "mode_policy_blocked",
            userInputRequest: params.userInputRequest,
            correctiveMessage: params.policyOverride.correctiveMessage,
            source: params.policyOverride.source,
        });
    }

    const totalClarificationCount = params.state.totalClarificationCount;
    const hasDurableProgressSinceLastResolution = params.state.hasDurableProgressSinceLastResolution;
    const nextState: ClarificationControllerState = {
        totalClarificationCount: totalClarificationCount + 1,
        hasDurableProgressSinceLastResolution: false,
        lastResolvedDecisionBoundaryKey: decisionBoundaryKey,
    };

    if (totalClarificationCount >= GENERAL_CLARIFICATION_MAX_TOTAL) {
        return buildClarificationSuppressionDecision({
            state: params.state,
            decisionBoundaryKey,
            reason: "budget_exhausted",
            userInputRequest: params.userInputRequest,
        });
    }

    if (!hasDurableProgressSinceLastResolution && totalClarificationCount >= GENERAL_CLARIFICATION_MAX_PRE_PROGRESS) {
        const reason = params.state.lastResolvedDecisionBoundaryKey === decisionBoundaryKey
            ? "repeat_without_progress"
            : "preprogress_budget_exhausted";
        return buildClarificationSuppressionDecision({
            state: params.state,
            decisionBoundaryKey,
            reason,
            userInputRequest: params.userInputRequest,
        });
    }

    return {
        allowPause: true,
        nextState,
    };
}

export async function resolvePendingUserInputSource(params: {
    sourceRunId: string;
    conversationId?: string | null;
    callId: string;
}): Promise<PendingUserInputSource> {
    const run = await prisma.agentRun.findFirst({
        where: {
            id: params.sourceRunId,
            ...(params.conversationId ? { conversationId: params.conversationId } : {}),
        },
        select: {
            id: true,
            conversationId: true,
        },
    }) as Pick<ClarificationLineageRunRecord, "id" | "conversationId"> | null;

    if (!run) {
        throw new Error("The pending clarification source run could not be found.");
    }

    const events = await prisma.runEvent.findMany({
        where: {
            runId: run.id,
            type: {
                in: ["user_input_required", "user_input_resolved"],
            },
        },
        orderBy: [{ sequence: "desc" }],
        take: 20,
        select: {
            runId: true,
            sequence: true,
            type: true,
            payload: true,
            toolName: true,
            createdAt: true,
        },
    }) as ClarificationLineageEventRecord[];

    const requiredEvent = events.find((event) => {
        if (event.type !== "user_input_required") return false;
        const payload = asObject(event.payload) as UserInputRequest | null;
        return payload?.callId === params.callId;
    });

    if (!requiredEvent) {
        throw new Error("The pending clarification request is stale or no longer active.");
    }

    const resolutionEvent = events.find((event) => {
        if (event.type !== "user_input_resolved") return false;
        const payload = asObject(event.payload) as UserInputResolution | null;
        return payload?.callId === params.callId && event.sequence > requiredEvent.sequence;
    });

    if (resolutionEvent) {
        throw new Error("That clarification request has already been resolved.");
    }

    const request = asObject(requiredEvent.payload) as UserInputRequest | null;
    if (!request?.callId) {
        throw new Error("The pending clarification payload is invalid.");
    }

    return {
        sourceRunId: run.id,
        conversationId: run.conversationId ?? null,
        request: {
            ...request,
            questionId: resolveUserInputQuestionId(request.questionId, request.callId),
            sourceRunId: run.id,
        },
        requiredSequence: requiredEvent.sequence,
    };
}

export async function persistUserInputResolution(params: {
    resolution: UserInputResolution;
}): Promise<void> {
    await recordRunEvent({
        runId: params.resolution.sourceRunId,
        type: "user_input_resolved",
        payload: params.resolution,
        failureMode: "strict",
        degradationReason: "user_input_resolved_persistence_failed",
        logContext: "user_input_resolved",
    });
}

export function buildUserInputResolutionContinuationContext(params: {
    request: UserInputRequest;
    resolution: UserInputResolution;
    controllerState: ClarificationControllerState;
}): string {
    const questionId = resolveUserInputQuestionId(
        params.resolution.questionId ?? params.request.questionId,
        params.resolution.callId,
    );
    return [
        "seed_kind=user_input_resolution",
        `source_run_id=${params.resolution.sourceRunId}`,
        `user_input_call_id=${params.resolution.callId}`,
        `user_input_question_id=${questionId}`,
        `resolution=${params.resolution.resolution}`,
        `clarification_count=${params.controllerState.totalClarificationCount}`,
        `has_durable_progress_since_last_resolution=${params.controllerState.hasDurableProgressSinceLastResolution ? "true" : "false"}`,
        `decision_boundary_key=${params.resolution.decisionBoundaryKey ?? resolveDecisionBoundaryKey({
            decisionBoundaryKey: params.request.decisionBoundaryKey ?? null,
            question: params.request.question,
        })}`,
        "authoritative_input_only=true",
        "rerun_policy=fresh_retry_only",
        "request_json:",
        serializeForPrompt(params.request),
        "resolution_json:",
        serializeForPrompt(params.resolution),
    ].join("\n");
}
