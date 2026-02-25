"use server";

import { getProjectRecentActivity } from "@/lib/server/activity";
import type { ProjectActivityItem } from "@/types/activity";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";

export async function getRecentActivityAction(projectId: string, limit = 8): Promise<ActionResult<ProjectActivityItem[]>> {
    return withAction(() =>
        withAuth(({ userId, workspaceId }) =>
            getProjectRecentActivity({ ownerId: userId, workspaceId }, projectId, limit),
        ),
    );
}
