import { prisma } from "@/lib/server/prisma";
import { getTool, type ToolExecutionContext, type ToolPrerequisiteBlockedHint, type ToolPrerequisiteKind } from "@/lib/server/ai/tools/base";
import type { AIErrorEnvelope, ToolResult } from "@/types/ai";
import type { ToolExecutionRequest, ToolMiddleware } from "@/lib/server/ai/tool-middleware";
import type { ProtocolData } from "@/types/protocol";

type ToolPrerequisiteEvaluation =
    | { allowed: true }
    | {
        allowed: false;
        envelope: AIErrorEnvelope;
        blockedHint: ToolPrerequisiteBlockedHint;
        repeatKey: string;
    };

function resolveProjectId(request: ToolExecutionRequest): string | undefined {
    const projectId = request.context?.projectId ?? request.args.projectId;
    return typeof projectId === "string" && projectId.trim().length > 0 ? projectId.trim() : undefined;
}

function resolveStudyId(request: ToolExecutionRequest): string | undefined {
    const studyId = request.context?.studyId ?? request.args.studyId;
    return typeof studyId === "string" && studyId.trim().length > 0 ? studyId.trim() : undefined;
}

function hasScreeningCriteria(protocolData: ProtocolData | null | undefined): boolean {
    if (!protocolData) return false;
    return protocolData.eligibility.inclusion.length > 0 || protocolData.eligibility.exclusion.length > 0;
}

async function loadCriteriaReadiness(context: ToolExecutionContext | undefined, projectId: string): Promise<boolean> {
    if (hasScreeningCriteria(context?.protocolData)) {
        return true;
    }

    const protocol = await prisma.protocol.findUnique({
        where: { projectId },
        select: { data: true },
    });

    const protocolData = (protocol?.data ?? null) as ProtocolData | null;
    return hasScreeningCriteria(protocolData);
}

function buildMissingPrerequisiteEnvelope(params: {
    code: string;
    message: string;
}): AIErrorEnvelope {
    return {
        kind: "missing_prerequisite",
        code: params.code,
        retryable: false,
        source: "tool_prerequisite_gate",
        message: params.message,
    };
}

function blockedEvaluation(params: {
    toolName: string;
    code: string;
    message: string;
    blockedHint: ToolPrerequisiteBlockedHint;
}): ToolPrerequisiteEvaluation {
    return {
        allowed: false,
        envelope: buildMissingPrerequisiteEnvelope({
            code: params.code,
            message: params.message,
        }),
        blockedHint: params.blockedHint,
        repeatKey: `${params.toolName}:${params.code}`,
    };
}

async function evaluateRequirement(
    prerequisite: ToolPrerequisiteKind,
    request: ToolExecutionRequest,
    blockedHint: ToolPrerequisiteBlockedHint,
): Promise<ToolPrerequisiteEvaluation> {
    const toolName = request.name;

    switch (prerequisite) {
        case "project_required": {
            if (resolveProjectId(request)) return { allowed: true };
            return blockedEvaluation({
                toolName,
                code: "PROJECT_CONTEXT_REQUIRED",
                message: "This action needs an open project before it can run.",
                blockedHint,
            });
        }
        case "study_required": {
            if (resolveStudyId(request)) return { allowed: true };
            return blockedEvaluation({
                toolName,
                code: "STUDY_CONTEXT_REQUIRED",
                message: "This action needs a study target before it can run.",
                blockedHint,
            });
        }
        case "protocol_required": {
            if (resolveProjectId(request)) return { allowed: true };
            return blockedEvaluation({
                toolName,
                code: "PROTOCOL_CONTEXT_REQUIRED",
                message: "This action needs a project protocol context before it can run.",
                blockedHint,
            });
        }
        case "criteria_required": {
            const projectId = resolveProjectId(request);
            if (!projectId) {
                return blockedEvaluation({
                    toolName,
                    code: "PROJECT_CONTEXT_REQUIRED",
                    message: "This action needs an open project before it can run.",
                    blockedHint,
                });
            }

            const ready = await loadCriteriaReadiness(request.context, projectId);
            if (ready) return { allowed: true };
            return blockedEvaluation({
                toolName,
                code: "SCREENING_CRITERIA_REQUIRED",
                message: "This action needs at least one inclusion or exclusion criterion before it can run.",
                blockedHint,
            });
        }
        default:
            return { allowed: true };
    }
}

export async function evaluateToolPrerequisites(
    request: ToolExecutionRequest,
): Promise<ToolPrerequisiteEvaluation> {
    const tool = getTool(request.name);
    const prerequisites = tool?.prerequisites;
    if (!prerequisites || prerequisites.required.length === 0) {
        return { allowed: true };
    }

    const blockedHint = prerequisites.blockedHint ?? "stop_with_explanation";
    for (const prerequisite of prerequisites.required) {
        const evaluation = await evaluateRequirement(prerequisite, request, blockedHint);
        if (!evaluation.allowed) {
            return evaluation;
        }
    }

    return { allowed: true };
}

export function createMissingPrerequisiteToolResult(
    request: ToolExecutionRequest,
    evaluation: Exclude<ToolPrerequisiteEvaluation, { allowed: true }>,
): ToolResult {
    return {
        callId: request.callId,
        result: null,
        error: evaluation.envelope.message,
        errorMeta: evaluation.envelope,
    };
}

export function createToolPrerequisiteMiddleware(): ToolMiddleware {
    return {
        name: "tool-prerequisite-gate",
        before: async (request) => {
            const evaluation = await evaluateToolPrerequisites(request);
            if (evaluation.allowed) return request;
            return {
                ...request,
                shortCircuitResult: createMissingPrerequisiteToolResult(request, evaluation),
            };
        },
    };
}
