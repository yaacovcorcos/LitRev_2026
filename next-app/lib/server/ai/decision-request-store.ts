import "server-only";

import type { Prisma } from "@prisma/client";
import {
    buildDecisionRequestFromUserInput,
    buildDecisionResolutionFromUserInput,
    normalizeUserInputRequestWithDecisionRequest,
} from "@/lib/ai/decision-requests";
import { prisma } from "@/lib/server/prisma";
import type {
    DecisionRequest,
    DecisionResolution,
    UserInputRequest,
    UserInputResolution,
} from "@/types/ai";

type DecisionTransactionClient = Prisma.TransactionClient;

export type DecisionRequestRecordView = {
    id: string;
    callId: string;
    sourceRunId: string;
    rootRunId: string | null;
    conversationId: string | null;
    projectId: string | null;
    userId: string | null;
    studyId: string | null;
    decisionBoundaryKey: string;
    status: string;
    request: unknown;
    createdAt: Date;
    resolvedAt: Date | null;
};

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nullable(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed || null;
}

function scopeFromDecision(decisionRequest: DecisionRequest, params: {
    sourceRunId: string;
    rootRunId?: string | null;
    conversationId?: string | null;
    projectId?: string | null;
    userId?: string | null;
    studyId?: string | null;
}) {
    return {
        sourceRunId: params.sourceRunId,
        rootRunId: nullable(params.rootRunId ?? decisionRequest.rootRunId),
        conversationId: nullable(params.conversationId ?? decisionRequest.conversationId),
        projectId: nullable(params.projectId ?? decisionRequest.projectId),
        userId: nullable(params.userId ?? decisionRequest.userId),
        studyId: nullable(params.studyId ?? decisionRequest.studyId),
    };
}

export function parseDecisionRequestRecordRequest(record: DecisionRequestRecordView): UserInputRequest | null {
    const value = record.request;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const request = value as UserInputRequest;
    if (!request.callId || request.callId !== record.callId) return null;
    try {
        return normalizeUserInputRequestWithDecisionRequest({
            request,
            sourceRunId: record.sourceRunId,
            rootRunId: record.rootRunId,
            conversationId: record.conversationId,
            projectId: record.projectId,
            userId: record.userId,
            studyId: record.studyId,
            status: record.status === "pending" ? "pending" : undefined,
        });
    } catch {
        return null;
    }
}

export async function upsertDecisionRequestForUserInputWithinTransaction(
    tx: DecisionTransactionClient,
    params: {
        request: UserInputRequest;
        sourceRunId: string;
        rootRunId?: string | null;
        conversationId?: string | null;
        projectId?: string | null;
        userId?: string | null;
        studyId?: string | null;
    },
): Promise<DecisionRequest> {
    const normalizedRequest = normalizeUserInputRequestWithDecisionRequest({
        request: params.request,
        sourceRunId: params.sourceRunId,
        rootRunId: params.rootRunId,
        conversationId: params.conversationId,
        projectId: params.projectId,
        userId: params.userId,
        studyId: params.studyId,
        status: "pending",
    });
    const decisionRequest = buildDecisionRequestFromUserInput({
        request: normalizedRequest,
        sourceRunId: params.sourceRunId,
        rootRunId: params.rootRunId,
        conversationId: params.conversationId,
        projectId: params.projectId,
        userId: params.userId,
        studyId: params.studyId,
        status: "pending",
    });
    const scope = scopeFromDecision(decisionRequest, params);

    await tx.decisionRequestRecord.upsert({
        where: {
            sourceRunId_callId: {
                sourceRunId: params.sourceRunId,
                callId: normalizedRequest.callId,
            },
        },
        create: {
            callId: normalizedRequest.callId,
            sourceRunId: params.sourceRunId,
            rootRunId: scope.rootRunId,
            conversationId: scope.conversationId,
            projectId: scope.projectId,
            userId: scope.userId,
            studyId: scope.studyId,
            decisionBoundaryKey: decisionRequest.decisionBoundaryKey,
            status: "pending",
            request: toInputJsonValue(normalizedRequest),
        },
        update: {
            rootRunId: scope.rootRunId,
            conversationId: scope.conversationId,
            projectId: scope.projectId,
            userId: scope.userId,
            studyId: scope.studyId,
            decisionBoundaryKey: decisionRequest.decisionBoundaryKey,
            request: toInputJsonValue(normalizedRequest),
        },
    });

    return decisionRequest;
}

export async function findDecisionRequestRecordForUserInput(params: {
    sourceRunId: string;
    conversationId?: string | null;
    callId: string;
}): Promise<DecisionRequestRecordView | null> {
    return prisma.decisionRequestRecord.findFirst({
        where: {
            sourceRunId: params.sourceRunId,
            callId: params.callId,
            ...(params.conversationId ? { conversationId: params.conversationId } : {}),
        },
        select: {
            id: true,
            callId: true,
            sourceRunId: true,
            rootRunId: true,
            conversationId: true,
            projectId: true,
            userId: true,
            studyId: true,
            decisionBoundaryKey: true,
            status: true,
            request: true,
            createdAt: true,
            resolvedAt: true,
        },
    }) as Promise<DecisionRequestRecordView | null>;
}

function statusForResolution(resolution: UserInputResolution): string {
    if (resolution.resolution === "accept_recommended") return "accepted_recommended";
    return resolution.resolution;
}

export async function resolveDecisionRequestForUserInputWithinTransaction(
    tx: DecisionTransactionClient,
    params: {
        request: UserInputRequest;
        resolution: UserInputResolution;
    },
): Promise<DecisionResolution | null> {
    const decisionResolution = buildDecisionResolutionFromUserInput(params);
    const record = await tx.decisionRequestRecord.findFirst({
        where: {
            sourceRunId: params.resolution.sourceRunId,
            callId: params.resolution.callId,
        },
        select: { id: true },
    });
    if (!record) return null;

    await tx.decisionRequestRecord.update({
        where: { id: record.id },
        data: {
            status: statusForResolution(params.resolution),
            resolvedAt: new Date(params.resolution.answeredAt),
        },
    });
    await tx.decisionResolutionRecord.upsert({
        where: { requestId: record.id },
        create: {
            requestId: record.id,
            callId: params.resolution.callId,
            sourceRunId: params.resolution.sourceRunId,
            resolutionKind: decisionResolution.resolutionKind,
            resolution: toInputJsonValue(decisionResolution),
            userId: null,
            createdAt: new Date(params.resolution.answeredAt),
        },
        update: {
            resolutionKind: decisionResolution.resolutionKind,
            resolution: toInputJsonValue(decisionResolution),
        },
    });
    return decisionResolution;
}
