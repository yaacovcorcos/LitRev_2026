"use server";

import { z } from "zod";
import { getProjectRecentActivity } from "@/lib/server/activity";
import type { ProjectActivityItem } from "@/types/activity";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";

const getRecentActivityInput = z.object({
    projectId: projectIdSchema,
    limit: z.number().int().min(1).max(100).optional(),
});

export async function getRecentActivityAction(projectId: string, limit = 8): Promise<ActionResult<ProjectActivityItem[]>> {
    return withValidatedAction(getRecentActivityInput, { projectId, limit },
        (v) => withAuth(({ userId, workspaceId }) =>
            getProjectRecentActivity({ ownerId: userId, workspaceId }, v.projectId, v.limit ?? 8),
        ),
    );
}
