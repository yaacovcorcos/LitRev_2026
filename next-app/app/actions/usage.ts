"use server";

import "server-only";
import { prisma } from "@/lib/server/prisma";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";

export async function getTokenUsageTodayAction(projectId: string): Promise<ActionResult<{ totalTokens: number }>> {
    return withValidatedAction(projectIdSchema, projectId,
        (id) => withAuth(async ({ userId, workspaceId }) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const result = await prisma.aIUsage.aggregate({
                where: {
                    projectId: id,
                    userId,
                    workspaceId,
                    createdAt: { gte: today },
                },
                _sum: { inputTokens: true, outputTokens: true },
            });
            return {
                totalTokens: (result._sum.inputTokens ?? 0) + (result._sum.outputTokens ?? 0),
            };
        }),
    );
}

