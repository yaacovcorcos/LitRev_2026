/**
 * PRISMA Stats Aggregation
 * Computes study flow statistics for PRISMA compliance (planC Phase 5.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";

export interface PRISMAStats {
    identification: { total: number };
    screening: {
        screened: number;
        excluded: number;
        exclusionReasons: { reason: string; count: number }[];
    };
    included: { total: number };
    pending: { maybe: number; unscreened: number };
}

/**
 * Compute PRISMA-style stats for a project.
 * Counts studies by triage decision and groups exclusion reasons from ProjectMemory.
 */
export async function getPRISMAStats(projectId: string): Promise<PRISMAStats> {
    const [studies, exclusionMemories] = await Promise.all([
        prisma.study.findMany({
            where: { projectId },
            select: { details: true },
        }),
        prisma.projectMemory.findMany({
            where: {
                projectId,
                type: "decision",
                category: "exclusion",
                status: "active",
            },
            select: { rationale: true },
        }),
    ]);

    let included = 0;
    let excluded = 0;
    let maybe = 0;
    let unscreened = 0;

    for (const s of studies) {
        const d = s.details as Record<string, unknown> | null;
        switch (d?.triageDecision) {
            case "keep":
                included++;
                break;
            case "exclude":
                excluded++;
                break;
            case "maybe":
                maybe++;
                break;
            default:
                unscreened++;
                break;
        }
    }

    // Group exclusion reasons by rationale (not statement, which includes study-specific title)
    const reasonCounts = new Map<string, number>();
    for (const mem of exclusionMemories) {
        const reason = mem.rationale?.trim() || "No reason provided";
        const count = reasonCounts.get(reason) ?? 0;
        reasonCounts.set(reason, count + 1);
    }

    const exclusionReasons = Array.from(reasonCounts.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

    return {
        identification: { total: studies.length },
        screening: {
            screened: included + excluded + maybe,
            excluded,
            exclusionReasons,
        },
        included: { total: included },
        pending: { maybe, unscreened },
    };
}
