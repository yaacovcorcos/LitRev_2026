/**
 * AI Rate Limiter
 * Mandatory rate limiting and usage logging for cost control
 */

import { prisma } from "@/lib/server/prisma";
import { AI_CONFIG, getModelCapabilityRecord } from "@/lib/ai/config";
import type { DeliveryMode, ReasoningEffort } from "@/types/ai";
import type { UsageStats } from "@/types/ai";

type CacheMetricAccumulator = {
    requestCount: number;
    cacheHitRequests: number;
    totalInputTokens: number;
    totalCachedInputTokens: number;
    lastModel: string;
    updatedAt: string;
};

export function estimateUsageCostUsd(params: {
    modelId: string;
    inputTokens: number;
    cachedInputTokens?: number;
    cacheWriteInputTokens?: number;
    outputTokens: number;
    confirmedDeliveryMode?: DeliveryMode | null;
}): number | undefined {
    const model = getModelCapabilityRecord(params.modelId);
    const pricing = model?.pricing;
    if (!model || !pricing) return undefined;

    // OpenAI priority processing is account/product specific. Persisting a
    // base-tier estimate here would look exact while knowingly undercounting.
    if (model.providerDialect === "openai" && params.confirmedDeliveryMode === "priority") {
        return undefined;
    }

    const inputTokens = Math.max(0, params.inputTokens);
    const cachedInputTokens = Math.max(0, Math.min(inputTokens, params.cachedInputTokens ?? 0));
    const cacheWriteInputTokens = Math.max(0, Math.min(inputTokens, params.cacheWriteInputTokens ?? 0));
    if (cachedInputTokens + cacheWriteInputTokens > inputTokens) return undefined;
    if (cacheWriteInputTokens > 0 && pricing.cacheWriteInputPerMillion === undefined) return undefined;
    const ordinaryInputTokens = inputTokens - cachedInputTokens - cacheWriteInputTokens;
    const outputTokens = Math.max(0, params.outputTokens);

    let inputMultiplier = 1;
    let outputMultiplier = 1;
    if (model.providerDialect === "openai" && inputTokens > 272_000) {
        inputMultiplier = 2;
        outputMultiplier = 1.5;
    } else if (model.providerDialect === "qwen" && inputTokens > 256_000) {
        inputMultiplier = 3;
        outputMultiplier = 3;
    }

    if (model.providerDialect === "xai" && params.confirmedDeliveryMode === "priority") {
        inputMultiplier *= 2;
        outputMultiplier *= 2;
    }

    return (
        (ordinaryInputTokens * pricing.inputPerMillion * inputMultiplier)
        + (cachedInputTokens * (pricing.cachedInputPerMillion ?? pricing.inputPerMillion) * inputMultiplier)
        + (cacheWriteInputTokens * (pricing.cacheWriteInputPerMillion ?? pricing.inputPerMillion) * inputMultiplier)
        + (outputTokens * pricing.outputPerMillion * outputMultiplier)
    ) / 1_000_000;
}

export interface CacheMetricSummary {
    requestCount: number;
    cacheHitRequests: number;
    cacheHitRate: number;
    totalInputTokens: number;
    totalCachedInputTokens: number;
    cachedTokenRate: number;
    lastModel: string;
    updatedAt: string;
}

const cacheMetricsByProject = new Map<string, CacheMetricAccumulator>();

export type UsageScopeInput =
    | string
    | null
    | {
        projectId?: string | null;
        userId?: string | null;
        workspaceId?: string | null;
    };

type UsageScope = {
    projectId: string | null;
    userId: string | null;
    workspaceId: string | null;
};

const LEGACY_UNKNOWN = "legacy_unknown" as const;

export type AIUsageSource =
    | "project_copilot"
    | "ai_page"
    | "voice_transcription"
    | typeof LEGACY_UNKNOWN;

export type AIUsageContextPage =
    | "ledger"
    | "protocol"
    | "draft"
    | "study"
    | "ai"
    | "overview"
    | "notes"
    | "memory"
    | typeof LEGACY_UNKNOWN;

function normalizeUsageSource(source?: string | null, projectId?: string | null): AIUsageSource {
    if (
        source === "project_copilot"
        || source === "ai_page"
        || source === "voice_transcription"
        || source === LEGACY_UNKNOWN
    ) {
        return source;
    }
    return projectId ? "project_copilot" : "ai_page";
}

function normalizeUsageContextPage(contextPage?: string | null): AIUsageContextPage {
    switch (contextPage) {
        case "ledger":
        case "protocol":
        case "draft":
        case "study":
        case "ai":
        case "overview":
        case "notes":
        case "memory":
            return contextPage;
        default:
            return LEGACY_UNKNOWN;
    }
}

function normalizeScope(input: UsageScopeInput): UsageScope {
    if (typeof input === "string" || input === null) {
        return {
            projectId: input,
            userId: null,
            workspaceId: null,
        };
    }

    return {
        projectId: input.projectId ?? null,
        userId: input.userId ?? null,
        workspaceId: input.workspaceId ?? null,
    };
}

function usageWhere(scope: UsageScope, createdAtGte: Date) {
    if (scope.userId) {
        return {
            userId: scope.userId,
            workspaceId: scope.workspaceId ?? undefined,
            createdAt: { gte: createdAtGte },
        };
    }

    return {
        projectId: scope.projectId,
        createdAt: { gte: createdAtGte },
    };
}

export async function countUsageRequestsSince(
    scopeInput: UsageScopeInput,
    createdAtGte: Date,
    options?: {
        source?: string | null;
    },
): Promise<number> {
    const scope = normalizeScope(scopeInput);

    return prisma.aIUsage.count({
        where: {
            ...usageWhere(scope, createdAtGte),
            ...(options?.source ? { source: options.source } : {}),
        },
    });
}

function clampCachedTokens(inputTokens: number, cachedInputTokens: number): number {
    if (!Number.isFinite(cachedInputTokens) || cachedInputTokens <= 0) return 0;
    const safeInput = Math.max(0, inputTokens);
    return Math.min(Math.round(cachedInputTokens), safeInput);
}

export function recordCacheMetric(
    projectId: string,
    model: string,
    inputTokens: number,
    cachedInputTokens: number
): CacheMetricSummary {
    const safeInputTokens = Math.max(0, Math.round(inputTokens));
    const safeCachedTokens = clampCachedTokens(safeInputTokens, cachedInputTokens);
    const prev = cacheMetricsByProject.get(projectId);
    const next: CacheMetricAccumulator = {
        requestCount: (prev?.requestCount ?? 0) + 1,
        cacheHitRequests: (prev?.cacheHitRequests ?? 0) + (safeCachedTokens > 0 ? 1 : 0),
        totalInputTokens: (prev?.totalInputTokens ?? 0) + safeInputTokens,
        totalCachedInputTokens: (prev?.totalCachedInputTokens ?? 0) + safeCachedTokens,
        lastModel: model,
        updatedAt: new Date().toISOString(),
    };
    cacheMetricsByProject.set(projectId, next);
    return {
        requestCount: next.requestCount,
        cacheHitRequests: next.cacheHitRequests,
        cacheHitRate: next.requestCount > 0 ? next.cacheHitRequests / next.requestCount : 0,
        totalInputTokens: next.totalInputTokens,
        totalCachedInputTokens: next.totalCachedInputTokens,
        cachedTokenRate: next.totalInputTokens > 0 ? next.totalCachedInputTokens / next.totalInputTokens : 0,
        lastModel: next.lastModel,
        updatedAt: next.updatedAt,
    };
}

export function getCacheMetricSummary(projectId: string): CacheMetricSummary | null {
    const state = cacheMetricsByProject.get(projectId);
    if (!state) return null;
    return {
        requestCount: state.requestCount,
        cacheHitRequests: state.cacheHitRequests,
        cacheHitRate: state.requestCount > 0 ? state.cacheHitRequests / state.requestCount : 0,
        totalInputTokens: state.totalInputTokens,
        totalCachedInputTokens: state.totalCachedInputTokens,
        cachedTokenRate: state.totalInputTokens > 0 ? state.totalCachedInputTokens / state.totalInputTokens : 0,
        lastModel: state.lastModel,
        updatedAt: state.updatedAt,
    };
}

export function resetCacheMetricsForTests(): void {
    cacheMetricsByProject.clear();
}

/**
 * Check if a project has exceeded the rate limit
 * Returns true if the request should be allowed
 */
export async function checkRateLimit(scopeInput: UsageScopeInput): Promise<boolean> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentRequests = await countUsageRequestsSince(scopeInput, oneMinuteAgo);

    return recentRequests < AI_CONFIG.maxRequestsPerMinute;
}

/**
 * Check if a project has exceeded the daily token limit
 * Returns true if the request should be allowed
 */
export async function checkDailyTokenLimit(scopeInput: UsageScopeInput): Promise<boolean> {
    const scope = normalizeScope(scopeInput);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayUsage = await prisma.aIUsage.aggregate({
        where: usageWhere(scope, startOfDay),
        _sum: {
            inputTokens: true,
            outputTokens: true,
        },
    });

    const totalTokens = (todayUsage._sum.inputTokens || 0) + (todayUsage._sum.outputTokens || 0);
    return totalTokens < AI_CONFIG.maxTokensPerDay;
}

/**
 * Record usage for a request
 */
export async function recordUsage(
    projectId: string | null,
    model: string,
    inputTokens: number,
    outputTokens: number,
    options?: {
        cachedInputTokens?: number;
        cacheWriteInputTokens?: number;
        reasoningTokens?: number;
        provider?: string | null;
        requestedModel?: string | null;
        requestedProvider?: string | null;
        requestedReasoningEffort?: ReasoningEffort | null;
        requestedDeliveryMode?: DeliveryMode | null;
        actualReasoningEffort?: ReasoningEffort | null;
        actualDeliveryMode?: DeliveryMode | null;
        userId?: string | null;
        workspaceId?: string | null;
        source?: string | null;
        contextPage?: string | null;
        conversationId?: string | null;
    },
): Promise<void> {
    const scope = normalizeScope({
        projectId,
        userId: options?.userId ?? null,
        workspaceId: options?.workspaceId ?? null,
    });
    const cachedInputTokens = Math.max(0, Math.min(inputTokens, options?.cachedInputTokens ?? 0));
    const cacheWriteInputTokens = Math.max(0, Math.min(inputTokens, options?.cacheWriteInputTokens ?? 0));
    const estimatedCostUsd = estimateUsageCostUsd({
        modelId: options?.requestedModel ?? model,
        inputTokens,
        cachedInputTokens,
        cacheWriteInputTokens,
        outputTokens,
        confirmedDeliveryMode: options?.actualDeliveryMode,
    });

    await prisma.aIUsage.create({
        data: {
            projectId: scope.projectId,
            userId: scope.userId,
            workspaceId: scope.workspaceId,
            source: normalizeUsageSource(options?.source, scope.projectId),
            contextPage: normalizeUsageContextPage(options?.contextPage),
            conversationId: options?.conversationId ?? null,
            model,
            provider: options?.provider ?? null,
            requestedModel: options?.requestedModel ?? null,
            requestedProvider: options?.requestedProvider ?? null,
            requestedReasoningEffort: options?.requestedReasoningEffort ?? null,
            requestedDeliveryMode: options?.requestedDeliveryMode ?? null,
            actualReasoningEffort: options?.actualReasoningEffort ?? null,
            actualDeliveryMode: options?.actualDeliveryMode ?? null,
            inputTokens,
            cachedInputTokens,
            cacheWriteInputTokens,
            outputTokens,
            reasoningTokens: Math.max(0, options?.reasoningTokens ?? 0),
            estimatedCostUsd,
        },
    });

    if (projectId) {
        recordCacheMetric(
            projectId,
            model,
            inputTokens,
            cachedInputTokens,
        );
    }
}

/**
 * Get usage stats for a project
 */
export async function getUsageStats(projectId: string): Promise<UsageStats> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayStats, lastRequest] = await Promise.all([
        prisma.aIUsage.aggregate({
            where: {
                projectId,
                createdAt: { gte: startOfDay },
            },
            _sum: {
                inputTokens: true,
                outputTokens: true,
            },
            _count: true,
        }),
        prisma.aIUsage.findFirst({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        }),
    ]);

    return {
        totalTokens: (todayStats._sum.inputTokens || 0) + (todayStats._sum.outputTokens || 0),
        requestCount: todayStats._count,
        lastRequestAt: lastRequest?.createdAt.toISOString() || null,
    };
}

/**
 * Validate rate limits before a request
 * Throws an error if limits are exceeded
 */
export async function validateRateLimits(scopeInput: UsageScopeInput): Promise<void> {
    const scope = normalizeScope(scopeInput);
    const [rateOk, tokensOk] = await Promise.all([
        checkRateLimit(scope),
        checkDailyTokenLimit(scope),
    ]);

    if (!rateOk) {
        throw new Error(`Rate limit exceeded. Maximum ${AI_CONFIG.maxRequestsPerMinute} requests per minute.`);
    }

    if (!tokensOk) {
        throw new Error(`Daily token limit exceeded. Maximum ${AI_CONFIG.maxTokensPerDay} tokens per day.`);
    }
}
