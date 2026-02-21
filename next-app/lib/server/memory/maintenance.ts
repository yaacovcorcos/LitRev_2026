import "server-only";

import { prisma } from "@/lib/server/prisma";

type UtilityRow = {
    id: string;
    retrievalCount: number;
    usedInAnswerCount: number;
    acceptedCount: number;
    rejectedCount: number;
    contradictionCount: number;
    pinned: boolean;
};

export interface MemoryMaintenanceResult {
    dryRun: boolean;
    evaluatedAt: string;
    candidates: {
        user: number;
        project: number;
        study: number;
    };
    archived: {
        user: number;
        project: number;
        study: number;
    };
}

const MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;
const lastRunByScope = new Map<string, number>();

export function utilityScore(row: UtilityRow): number {
    if (row.pinned) return Number.POSITIVE_INFINITY;
    return (
        (row.acceptedCount * 2) +
        (row.usedInAnswerCount * 1.5) +
        (row.retrievalCount * 0.25) -
        (row.rejectedCount * 1.5) -
        (row.contradictionCount * 1.25)
    );
}

export function shouldArchiveLowUtility(row: UtilityRow): boolean {
    if (row.pinned) return false;
    if (row.acceptedCount > 0 || row.usedInAnswerCount > 0) return false;
    const negativeSignalStrength = row.rejectedCount + row.contradictionCount;
    if (negativeSignalStrength < 2) return false;
    return utilityScore(row) <= -1;
}

function scopedKey(projectId?: string, userId?: string): string {
    return `project:${projectId || "-"}/user:${userId || "-"}`;
}

export async function runMemoryMaintenance(options: {
    projectId?: string;
    userId?: string;
    dryRun?: boolean;
}): Promise<MemoryMaintenanceResult> {
    const projectId = options.projectId;
    const userId = options.userId;
    const dryRun = options.dryRun ?? false;

    const [userRows, projectRows, studyRows] = await Promise.all([
        userId
            ? prisma.userMemory.findMany({
                where: { userId, status: "active", pinned: false },
                select: {
                    id: true,
                    retrievalCount: true,
                    usedInAnswerCount: true,
                    acceptedCount: true,
                    rejectedCount: true,
                    contradictionCount: true,
                    pinned: true,
                },
            })
            : Promise.resolve([]),
        projectId
            ? prisma.projectMemory.findMany({
                where: { projectId, status: "active", pinned: false },
                select: {
                    id: true,
                    retrievalCount: true,
                    usedInAnswerCount: true,
                    acceptedCount: true,
                    rejectedCount: true,
                    contradictionCount: true,
                    pinned: true,
                },
            })
            : Promise.resolve([]),
        projectId
            ? prisma.studyMemory.findMany({
                where: { projectId, status: "active", pinned: false },
                select: {
                    id: true,
                    retrievalCount: true,
                    usedInAnswerCount: true,
                    acceptedCount: true,
                    rejectedCount: true,
                    contradictionCount: true,
                    pinned: true,
                },
            })
            : Promise.resolve([]),
    ]);

    const userArchiveIds = userRows.filter(shouldArchiveLowUtility).map((row) => row.id);
    const projectArchiveIds = projectRows.filter(shouldArchiveLowUtility).map((row) => row.id);
    const studyArchiveIds = studyRows.filter(shouldArchiveLowUtility).map((row) => row.id);

    if (!dryRun) {
        if (userArchiveIds.length > 0) {
            await prisma.userMemory.updateMany({
                where: { id: { in: userArchiveIds } },
                data: { status: "archived", archivedAt: new Date() },
            });
        }
        if (projectArchiveIds.length > 0) {
            await prisma.projectMemory.updateMany({
                where: { id: { in: projectArchiveIds } },
                data: { status: "archived", archivedAt: new Date() },
            });
        }
        if (studyArchiveIds.length > 0) {
            await prisma.studyMemory.updateMany({
                where: { id: { in: studyArchiveIds } },
                data: { status: "archived" },
            });
        }
    }

    return {
        dryRun,
        evaluatedAt: new Date().toISOString(),
        candidates: {
            user: userArchiveIds.length,
            project: projectArchiveIds.length,
            study: studyArchiveIds.length,
        },
        archived: {
            user: dryRun ? 0 : userArchiveIds.length,
            project: dryRun ? 0 : projectArchiveIds.length,
            study: dryRun ? 0 : studyArchiveIds.length,
        },
    };
}

export async function runMemoryMaintenanceLoop(options: {
    projectId?: string;
    userId?: string;
}): Promise<MemoryMaintenanceResult | null> {
    const key = scopedKey(options.projectId, options.userId);
    const now = Date.now();
    const lastRun = lastRunByScope.get(key) || 0;
    if (now - lastRun < MAINTENANCE_INTERVAL_MS) return null;
    lastRunByScope.set(key, now);
    try {
        return await runMemoryMaintenance({
            projectId: options.projectId,
            userId: options.userId,
            dryRun: false,
        });
    } catch {
        return null;
    }
}

