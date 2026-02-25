/**
 * AI Rate Limiter
 * Mandatory rate limiting and usage logging for cost control
 */

import { prisma } from "@/lib/server/prisma";
import { AI_CONFIG } from "@/lib/ai/config";
import type { UsageStats } from "@/types/ai";

type CacheMetricAccumulator = {
    requestCount: number;
    cacheHitRequests: number;
    totalInputTokens: number;
    totalCachedInputTokens: number;
    lastModel: string;
    updatedAt: string;
};

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
export async function checkRateLimit(projectId: string | null): Promise<boolean> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const recentRequests = await prisma.aIUsage.count({
        where: {
            projectId,
            createdAt: { gte: oneMinuteAgo },
        },
    });

    return recentRequests < AI_CONFIG.maxRequestsPerMinute;
}

/**
 * Check if a project has exceeded the daily token limit
 * Returns true if the request should be allowed
 */
export async function checkDailyTokenLimit(projectId: string | null): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayUsage = await prisma.aIUsage.aggregate({
        where: {
            projectId,
            createdAt: { gte: startOfDay },
        },
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
    options?: { cachedInputTokens?: number }
): Promise<void> {
    await prisma.aIUsage.create({
        data: {
            projectId,
            model,
            inputTokens,
            outputTokens,
        },
    });

    if (projectId) {
        recordCacheMetric(
            projectId,
            model,
            inputTokens,
            options?.cachedInputTokens ?? 0,
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
export async function validateRateLimits(projectId: string | null): Promise<void> {
    const [rateOk, tokensOk] = await Promise.all([
        checkRateLimit(projectId),
        checkDailyTokenLimit(projectId),
    ]);

    if (!rateOk) {
        throw new Error(`Rate limit exceeded. Maximum ${AI_CONFIG.maxRequestsPerMinute} requests per minute.`);
    }

    if (!tokensOk) {
        throw new Error(`Daily token limit exceeded. Maximum ${AI_CONFIG.maxTokensPerDay} tokens per day.`);
    }
}
