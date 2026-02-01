/**
 * AI Rate Limiter
 * Mandatory rate limiting and usage logging for cost control
 */

import { prisma } from "@/lib/server/prisma";
import { AI_CONFIG } from "@/lib/ai/config";
import type { UsageStats } from "@/types/ai";

/**
 * Check if a project has exceeded the rate limit
 * Returns true if the request should be allowed
 */
export async function checkRateLimit(projectId: string): Promise<boolean> {
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
export async function checkDailyTokenLimit(projectId: string): Promise<boolean> {
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
    projectId: string,
    model: string,
    inputTokens: number,
    outputTokens: number
): Promise<void> {
    await prisma.aIUsage.create({
        data: {
            projectId,
            model,
            inputTokens,
            outputTokens,
        },
    });
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
export async function validateRateLimits(projectId: string): Promise<void> {
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
