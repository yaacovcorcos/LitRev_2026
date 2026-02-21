import "server-only";

import { prisma } from "@/lib/server/prisma";

export interface SourceAcceptanceMetric {
    source: string;
    accepted: number;
    rejected: number;
    acceptanceRate: number;
}

export interface MemoryQualityMetrics {
    retrievalHitRate: number;
    staleMemoryUsageRate: number;
    contradictionRate: number;
    proposalAcceptanceBySource: SourceAcceptanceMetric[];
    totals: {
        retrievalEvents: number;
        retrievedMemoryMentions: number;
        staleRetrievedMentions: number;
        retrievalCount: number;
        usedInAnswerCount: number;
        acceptedCount: number;
        rejectedCount: number;
        contradictionCount: number;
    };
}

function safeDiv(numerator: number, denominator: number): number {
    if (denominator <= 0) return 0;
    return numerator / denominator;
}

function clampRate(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

type RetrievalRow = { memoryType: string; memoryIds: string[] };

async function computeStaleUsageRate(retrievals: RetrievalRow[]): Promise<{ totalMentions: number; staleMentions: number }> {
    const idsByType = retrievals.reduce(
        (acc, row) => {
            if (!acc[row.memoryType]) acc[row.memoryType] = new Set<string>();
            for (const id of row.memoryIds) acc[row.memoryType].add(id);
            return acc;
        },
        {} as Record<string, Set<string>>,
    );

    const [userStatuses, projectStatuses, studyStatuses] = await Promise.all([
        idsByType.user?.size
            ? prisma.userMemory.findMany({
                where: { id: { in: [...idsByType.user] } },
                select: { id: true, status: true },
            })
            : Promise.resolve([]),
        idsByType.project?.size
            ? prisma.projectMemory.findMany({
                where: { id: { in: [...idsByType.project] } },
                select: { id: true, status: true },
            })
            : Promise.resolve([]),
        idsByType.study?.size
            ? prisma.studyMemory.findMany({
                where: { id: { in: [...idsByType.study] } },
                select: { id: true, status: true },
            })
            : Promise.resolve([]),
    ]);

    const statusMap = {
        user: new Map(userStatuses.map((row) => [row.id, row.status])),
        project: new Map(projectStatuses.map((row) => [row.id, row.status])),
        study: new Map(studyStatuses.map((row) => [row.id, row.status])),
    };

    let totalMentions = 0;
    let staleMentions = 0;
    for (const row of retrievals) {
        const map = row.memoryType === "user"
            ? statusMap.user
            : row.memoryType === "project"
                ? statusMap.project
                : row.memoryType === "study"
                    ? statusMap.study
                    : null;
        if (!map) continue;
        for (const id of row.memoryIds) {
            totalMentions += 1;
            const status = map.get(id);
            if (!status || status !== "active") staleMentions += 1;
        }
    }

    return { totalMentions, staleMentions };
}

export async function getMemoryQualityMetrics(projectId: string, userId: string = "single-user"): Promise<MemoryQualityMetrics> {
    const [retrievals, projectAgg, studyAgg, userAgg, projectSources, userSources] = await Promise.all([
        prisma.memoryRetrieval.findMany({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            take: 500,
            select: {
                memoryType: true,
                memoryIds: true,
            },
        }),
        prisma.projectMemory.aggregate({
            where: { projectId },
            _sum: {
                retrievalCount: true,
                usedInAnswerCount: true,
                acceptedCount: true,
                rejectedCount: true,
                contradictionCount: true,
            },
        }),
        prisma.studyMemory.aggregate({
            where: { projectId },
            _sum: {
                retrievalCount: true,
                usedInAnswerCount: true,
                acceptedCount: true,
                rejectedCount: true,
                contradictionCount: true,
            },
        }),
        prisma.userMemory.aggregate({
            where: { userId },
            _sum: {
                retrievalCount: true,
                usedInAnswerCount: true,
                acceptedCount: true,
                rejectedCount: true,
                contradictionCount: true,
            },
        }),
        prisma.projectMemory.groupBy({
            by: ["source"],
            where: { projectId },
            _sum: { acceptedCount: true, rejectedCount: true },
        }),
        prisma.userMemory.groupBy({
            by: ["source"],
            where: { userId },
            _sum: { acceptedCount: true, rejectedCount: true },
        }),
    ]);

    const retrievalCount =
        (projectAgg._sum.retrievalCount || 0) +
        (studyAgg._sum.retrievalCount || 0) +
        (userAgg._sum.retrievalCount || 0);
    const usedInAnswerCount =
        (projectAgg._sum.usedInAnswerCount || 0) +
        (studyAgg._sum.usedInAnswerCount || 0) +
        (userAgg._sum.usedInAnswerCount || 0);
    const acceptedCount =
        (projectAgg._sum.acceptedCount || 0) +
        (studyAgg._sum.acceptedCount || 0) +
        (userAgg._sum.acceptedCount || 0);
    const rejectedCount =
        (projectAgg._sum.rejectedCount || 0) +
        (studyAgg._sum.rejectedCount || 0) +
        (userAgg._sum.rejectedCount || 0);
    const contradictionCount =
        (projectAgg._sum.contradictionCount || 0) +
        (studyAgg._sum.contradictionCount || 0) +
        (userAgg._sum.contradictionCount || 0);

    const stale = await computeStaleUsageRate(retrievals as RetrievalRow[]);

    const bySource = new Map<string, { accepted: number; rejected: number }>();
    for (const row of projectSources) {
        const current = bySource.get(row.source) || { accepted: 0, rejected: 0 };
        bySource.set(row.source, {
            accepted: current.accepted + (row._sum.acceptedCount || 0),
            rejected: current.rejected + (row._sum.rejectedCount || 0),
        });
    }
    for (const row of userSources) {
        const current = bySource.get(row.source) || { accepted: 0, rejected: 0 };
        bySource.set(row.source, {
            accepted: current.accepted + (row._sum.acceptedCount || 0),
            rejected: current.rejected + (row._sum.rejectedCount || 0),
        });
    }

    const proposalAcceptanceBySource: SourceAcceptanceMetric[] = [...bySource.entries()]
        .map(([source, counts]) => ({
            source,
            accepted: counts.accepted,
            rejected: counts.rejected,
            acceptanceRate: clampRate(safeDiv(counts.accepted, counts.accepted + counts.rejected)),
        }))
        .sort((a, b) => b.acceptanceRate - a.acceptanceRate);

    return {
        retrievalHitRate: clampRate(safeDiv(usedInAnswerCount, retrievalCount)),
        staleMemoryUsageRate: clampRate(safeDiv(stale.staleMentions, stale.totalMentions)),
        contradictionRate: clampRate(safeDiv(contradictionCount, acceptedCount + contradictionCount)),
        proposalAcceptanceBySource,
        totals: {
            retrievalEvents: retrievals.length,
            retrievedMemoryMentions: stale.totalMentions,
            staleRetrievedMentions: stale.staleMentions,
            retrievalCount,
            usedInAnswerCount,
            acceptedCount,
            rejectedCount,
            contradictionCount,
        },
    };
}

