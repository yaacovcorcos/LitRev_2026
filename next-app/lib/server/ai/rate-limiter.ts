/**
 * AI Rate Limiter
 * Mandatory rate limiting and usage logging for cost control
 */

import { prisma } from "@/lib/server/prisma";
import { AI_CONFIG } from "@/lib/ai/config";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
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

export type UsageReservationStatus = "active" | "failed" | "unknown" | "settled";

export type ReserveProviderUsageAttemptInput = {
    attemptKey: string;
    scope: UsageScopeInput;
    provider: string;
    model: string;
    estimatedTokens: number;
    source?: string | null;
    contextPage?: string | null;
    conversationId?: string | null;
    dailyAttemptLimit?: number;
};

export type UsageAttemptReservation = {
    id: string;
    reservedTokens: number;
    status: UsageReservationStatus;
};

export type SettleUsageReservationInput = {
    reservationId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
};

const USAGE_ADMISSION_MAX_WAIT_MS = 750;
const USAGE_ADMISSION_TRANSACTION_TIMEOUT_MS = 1_500;
export const USAGE_ADMISSION_DEADLINE_MS = 2_250;
export const USAGE_SETTLEMENT_DEADLINE_MS = 750;

class UsageAdmissionDeadlineError extends Error {
    constructor() {
        super("AI usage admission timed out before the provider was called.");
        this.name = "UsageAdmissionDeadlineError";
    }
}

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

function usageScopeKey(scope: UsageScope): string {
    if (scope.userId) {
        return `user:${scope.userId}:workspace:${scope.workspaceId ?? "none"}`;
    }
    return `project:${scope.projectId ?? "global"}`;
}

function safeTokenCount(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value));
}

function positiveLimit(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.max(1, Math.round(value));
}

function assertMatchingActiveReservation(
    reservation: {
        id: string;
        scopeKey: string;
        provider: string;
        requestedModel: string;
        reservedTokens: number;
        status: string;
    } | null,
    expected: {
        attemptKey: string;
        scopeKey: string;
        provider: string;
        model: string;
    },
): UsageAttemptReservation | null {
    if (!reservation) return null;
    if (
        reservation.scopeKey !== expected.scopeKey
        || reservation.provider !== expected.provider
        || reservation.requestedModel !== expected.model
        || reservation.status !== "active"
    ) {
        throw new Error(
            `Usage reservation attempt key is already owned by another or invoked attempt: ${expected.attemptKey}`,
        );
    }
    return {
        id: reservation.id,
        reservedTokens: reservation.reservedTokens,
        status: "active",
    };
}

function withDeadline<T>(operation: Promise<T>, timeoutMs: number, timeoutError: () => Error): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(timeoutError()), Math.max(1, timeoutMs));
        if (typeof (timer as { unref?: () => void }).unref === "function") {
            (timer as { unref: () => void }).unref();
        }
        operation.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

function admissionError(error: unknown): AIErrorWithEnvelope {
    if (error instanceof AIErrorWithEnvelope) return error;
    const candidate = error && typeof error === "object"
        ? error as { code?: unknown; message?: unknown; meta?: { code?: unknown; message?: unknown } }
        : null;
    const errorCode = String(candidate?.code ?? "");
    const metadataValues = candidate?.meta && typeof candidate.meta === "object"
        ? Object.values(candidate.meta)
        : [];
    const databaseCode = String(candidate?.meta?.code ?? "");
    const errorMessage = [candidate?.message, candidate?.meta?.message, ...metadataValues]
        .filter((value): value is string => typeof value === "string")
        .join(" ");
    const timedOut = error instanceof UsageAdmissionDeadlineError
        || ["P1002", "P2024", "P2028", "ETIMEDOUT", "55P03", "57014"].includes(errorCode)
        || ["55P03", "57014"].includes(databaseCode)
        || /55P03|57014|lock not available|lock timeout|timed?\s*out|timeout|canceling statement/i.test(errorMessage);
    return new AIErrorWithEnvelope({
        kind: "runtime",
        code: timedOut ? "AI_USAGE_ADMISSION_TIMEOUT" : "AI_USAGE_ADMISSION_FAILED",
        retryable: true,
        source: "usage_reservation",
        status: 503,
        message: timedOut
            ? "Usage admission timed out before the AI provider was called. Please retry."
            : "Usage admission could not be persisted before the AI provider was called. Please retry.",
    });
}

/**
 * Atomically admit one provider attempt and reserve its conservative daily
 * token budget. The transaction-scoped advisory lock serializes admission for
 * the effective user/workspace or legacy project/global scope.
 */
export async function reserveProviderUsageAttempt(
    input: ReserveProviderUsageAttemptInput,
    options?: { deadlineMs?: number },
): Promise<UsageAttemptReservation> {
    const scope = normalizeScope(input.scope);
    const scopeKey = usageScopeKey(scope);
    const attemptKey = input.attemptKey.trim();
    if (!attemptKey) {
        throw new Error("Provider usage admission requires a non-empty attempt key.");
    }
    const requestLimit = positiveLimit(AI_CONFIG.maxRequestsPerMinute, 20);
    const dailyTokenLimit = positiveLimit(AI_CONFIG.maxTokensPerDay, 500_000);
    const reservedTokens = Number.isFinite(input.estimatedTokens)
        ? Math.max(1, safeTokenCount(input.estimatedTokens))
        : dailyTokenLimit;
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60_000);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const source = normalizeUsageSource(input.source, scope.projectId);
    const contextPage = normalizeUsageContextPage(input.contextPage);

    try {
        const transaction = prisma.$transaction(async (tx) => {
            await tx.$queryRaw<{ configured: string }[]>`
                SELECT set_config('lock_timeout', '750ms', true) AS configured
            `;
            await tx.$queryRaw<{ locked: number }[]>`
                SELECT 1 AS locked
                FROM pg_advisory_xact_lock(hashtext(${`ai-usage-admission:${scopeKey}`}))
            `;

            const existing = assertMatchingActiveReservation(
                await tx.aIUsageReservation.findUnique({
                    where: { attemptKey },
                    select: {
                        id: true,
                        scopeKey: true,
                        provider: true,
                        requestedModel: true,
                        reservedTokens: true,
                        status: true,
                    },
                }),
                {
                    attemptKey,
                    scopeKey,
                    provider: input.provider,
                    model: input.model,
                },
            );
            if (existing) return existing;

            const legacyRequestCount = await tx.aIUsage.count({
                where: {
                    ...usageWhere(scope, oneMinuteAgo),
                    reservationId: null,
                },
            });
            const reservationRequestCount = await tx.aIUsageReservation.count({
                where: {
                    scopeKey,
                    createdAt: { gte: oneMinuteAgo },
                },
            });
            if (legacyRequestCount + reservationRequestCount >= requestLimit) {
                throw new AIErrorWithEnvelope({
                    kind: "provider_request",
                    code: "AI_RATE_LIMIT_EXCEEDED",
                    retryable: true,
                    source: "usage_reservation",
                    status: 429,
                    headers: { "retry-after": "60" },
                    message: `Rate limit exceeded. Maximum ${requestLimit} provider attempts per minute.`,
                });
            }

            const dailyAttemptLimit = input.dailyAttemptLimit === undefined
                ? null
                : positiveLimit(input.dailyAttemptLimit, 1);
            if (dailyAttemptLimit !== null) {
                const [legacySourceAttempts, reservationSourceAttempts] = await Promise.all([
                    tx.aIUsage.count({
                        where: {
                            ...usageWhere(scope, startOfDay),
                            reservationId: null,
                            source,
                        },
                    }),
                    tx.aIUsageReservation.count({
                        where: {
                            scopeKey,
                            source,
                            createdAt: { gte: startOfDay },
                        },
                    }),
                ]);
                if (legacySourceAttempts + reservationSourceAttempts >= dailyAttemptLimit) {
                    throw new AIErrorWithEnvelope({
                        kind: "provider_request",
                        code: "AI_SOURCE_DAILY_ATTEMPT_LIMIT_EXCEEDED",
                        retryable: false,
                        source: "usage_reservation",
                        status: 429,
                        message: `Daily ${source} provider-attempt limit exceeded. Maximum ${dailyAttemptLimit} attempts per day.`,
                    });
                }
            }

            const actualUsage = await tx.aIUsage.aggregate({
                where: usageWhere(scope, startOfDay),
                _sum: {
                    inputTokens: true,
                    outputTokens: true,
                },
            });
            const outstandingReservations = await tx.aIUsageReservation.aggregate({
                where: {
                    scopeKey,
                    createdAt: { gte: startOfDay },
                    status: { not: "settled" },
                },
                _sum: { reservedTokens: true },
            });
            const usedTokens = (actualUsage._sum.inputTokens ?? 0)
                + (actualUsage._sum.outputTokens ?? 0);
            const outstandingTokens = outstandingReservations._sum.reservedTokens ?? 0;
            if (usedTokens + outstandingTokens + reservedTokens > dailyTokenLimit) {
                throw new AIErrorWithEnvelope({
                    kind: "provider_request",
                    code: "DAILY_TOKEN_LIMIT_EXCEEDED",
                    retryable: false,
                    source: "usage_reservation",
                    status: 429,
                    message: `Daily token limit exceeded. Maximum ${dailyTokenLimit} tokens per day.`,
                });
            }

            return tx.aIUsageReservation.create({
                data: {
                    attemptKey,
                    scopeKey,
                    userId: scope.userId,
                    workspaceId: scope.workspaceId,
                    projectId: scope.projectId,
                    conversationId: input.conversationId ?? null,
                    source,
                    contextPage,
                    provider: input.provider,
                    requestedModel: input.model,
                    reservedTokens,
                    status: "active",
                },
                select: {
                    id: true,
                    reservedTokens: true,
                    status: true,
                },
            });
        }, {
            maxWait: USAGE_ADMISSION_MAX_WAIT_MS,
            timeout: USAGE_ADMISSION_TRANSACTION_TIMEOUT_MS,
        });

        const reservation = await withDeadline(
            transaction,
            options?.deadlineMs ?? USAGE_ADMISSION_DEADLINE_MS,
            () => new UsageAdmissionDeadlineError(),
        );
        return reservation as UsageAttemptReservation;
    } catch (error) {
        try {
            const reconciled = assertMatchingActiveReservation(
                await withDeadline(
                    prisma.aIUsageReservation.findUnique({
                        where: { attemptKey },
                        select: {
                            id: true,
                            scopeKey: true,
                            provider: true,
                            requestedModel: true,
                            reservedTokens: true,
                            status: true,
                        },
                    }),
                    Math.min(options?.deadlineMs ?? USAGE_ADMISSION_DEADLINE_MS, 750),
                    () => new UsageAdmissionDeadlineError(),
                ),
                {
                    attemptKey,
                    scopeKey,
                    provider: input.provider,
                    model: input.model,
                },
            );
            if (reconciled) return reconciled;
        } catch (reconciliationError) {
            if (reconciliationError instanceof Error && /already owned/.test(reconciliationError.message)) {
                throw reconciliationError;
            }
        }
        throw admissionError(error);
    }
}

/** Idempotently settle a durable reservation into exactly one AIUsage row. */
export async function settleUsageReservation(
    input: SettleUsageReservationInput,
): Promise<{ settledNow: boolean }> {
    const inputTokens = safeTokenCount(input.inputTokens);
    const outputTokens = safeTokenCount(input.outputTokens);
    const result = await prisma.$transaction(async (tx) => {
        const initial = await tx.aIUsageReservation.findUnique({
            where: { id: input.reservationId },
            select: { scopeKey: true },
        });
        if (!initial) {
            throw new Error(`Usage reservation not found: ${input.reservationId}`);
        }
        await tx.$queryRaw<{ configured: string }[]>`
            SELECT set_config('lock_timeout', '750ms', true) AS configured
        `;
        await tx.$queryRaw<{ locked: number }[]>`
            SELECT 1 AS locked
            FROM pg_advisory_xact_lock(hashtext(${`ai-usage-admission:${initial.scopeKey}`}))
        `;
        await tx.$queryRaw<{ locked: number }[]>`
            SELECT 1 AS locked
            FROM pg_advisory_xact_lock(hashtext(${`ai-usage-settle:${input.reservationId}`}))
        `;
        const reservation = await tx.aIUsageReservation.findUnique({
            where: { id: input.reservationId },
        });
        if (!reservation) {
            throw new Error(`Usage reservation not found: ${input.reservationId}`);
        }
        if (reservation.status === "settled") {
            return { settledNow: false, projectId: reservation.projectId };
        }

        await tx.aIUsage.create({
            data: {
                reservationId: reservation.id,
                projectId: reservation.projectId,
                userId: reservation.userId,
                workspaceId: reservation.workspaceId,
                source: reservation.source,
                contextPage: reservation.contextPage,
                conversationId: reservation.conversationId,
                model: input.model,
                inputTokens,
                outputTokens,
                createdAt: reservation.createdAt,
            },
        });
        const settledAt = new Date();
        await tx.aIUsageReservation.update({
            where: { id: reservation.id },
            data: {
                status: "settled",
                actualModel: input.model,
                inputTokens,
                outputTokens,
                failureCode: null,
                settledAt,
            },
        });
        return { settledNow: true, projectId: reservation.projectId };
    }, {
        maxWait: USAGE_ADMISSION_MAX_WAIT_MS,
        timeout: USAGE_ADMISSION_TRANSACTION_TIMEOUT_MS,
    });

    if (result.settledNow && result.projectId) {
        recordCacheMetric(
            result.projectId,
            input.model,
            inputTokens,
            input.cachedInputTokens ?? 0,
        );
    }
    return { settledNow: result.settledNow };
}

export async function trySettleUsageReservation(
    input: SettleUsageReservationInput,
    options?: { deadlineMs?: number },
): Promise<boolean> {
    try {
        await withDeadline(
            settleUsageReservation(input),
            options?.deadlineMs ?? USAGE_SETTLEMENT_DEADLINE_MS,
            () => new Error("Usage settlement deadline exceeded"),
        );
        return true;
    } catch {
        return false;
    }
}

export async function markUsageReservationReconcilable(
    reservationId: string,
    status: Extract<UsageReservationStatus, "failed" | "unknown">,
    failureCode?: string,
): Promise<void> {
    await prisma.$transaction((tx) => tx.aIUsageReservation.updateMany({
        where: {
            id: reservationId,
            status: "active",
        },
        data: {
            status,
            failureCode: failureCode ?? null,
        },
    }), {
        maxWait: USAGE_ADMISSION_MAX_WAIT_MS,
        timeout: USAGE_ADMISSION_TRANSACTION_TIMEOUT_MS,
    });
}

export async function tryMarkUsageReservationReconcilable(
    reservationId: string,
    status: Extract<UsageReservationStatus, "failed" | "unknown">,
    failureCode?: string,
    options?: { deadlineMs?: number },
): Promise<boolean> {
    try {
        await withDeadline(
            markUsageReservationReconcilable(reservationId, status, failureCode),
            options?.deadlineMs ?? USAGE_SETTLEMENT_DEADLINE_MS,
            () => new Error("Usage reservation outcome deadline exceeded"),
        );
        return true;
    } catch {
        return false;
    }
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

    await prisma.aIUsage.create({
        data: {
            projectId: scope.projectId,
            userId: scope.userId,
            workspaceId: scope.workspaceId,
            source: normalizeUsageSource(options?.source, scope.projectId),
            contextPage: normalizeUsageContextPage(options?.contextPage),
            conversationId: options?.conversationId ?? null,
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
