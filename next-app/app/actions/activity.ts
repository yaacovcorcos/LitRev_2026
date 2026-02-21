"use server";

import { ensureSingleUserSeed } from "@/lib/server/bootstrap";
import { getProjectRecentActivity } from "@/lib/server/activity";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import type { ProjectActivityItem } from "@/types/activity";

export async function getRecentActivityAction(projectId: string, limit = 8): Promise<ProjectActivityItem[]> {
    try {
        await ensureSingleUserSeed(SINGLE_USER_SCOPE);
        return await getProjectRecentActivity(SINGLE_USER_SCOPE, projectId, limit);
    } catch (error) {
        console.error("getRecentActivityAction failed:", error);
        throw error;
    }
}
