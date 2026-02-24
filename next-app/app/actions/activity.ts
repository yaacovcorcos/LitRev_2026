"use server";

import { ensureSingleUserSeed } from "@/lib/server/bootstrap";
import { getProjectRecentActivity } from "@/lib/server/activity";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import type { ProjectActivityItem } from "@/types/activity";
import { withAction, type ActionResult } from "@/lib/server/action-utils";

export async function getRecentActivityAction(projectId: string, limit = 8): Promise<ActionResult<ProjectActivityItem[]>> {
    return withAction(async () => {
        await ensureSingleUserSeed(SINGLE_USER_SCOPE);
        return getProjectRecentActivity(SINGLE_USER_SCOPE, projectId, limit);
    });
}
