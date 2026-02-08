"use server";

import "server-only";
import { prisma } from "@/lib/server/prisma";

export async function getTokenUsageTodayAction(projectId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await prisma.aIUsage.aggregate({
        where: { projectId, createdAt: { gte: today } },
        _sum: { inputTokens: true, outputTokens: true },
    });
    return {
        totalTokens: (result._sum.inputTokens ?? 0) + (result._sum.outputTokens ?? 0),
    };
}
