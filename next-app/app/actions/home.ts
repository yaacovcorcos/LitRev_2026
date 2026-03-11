"use server";

import type { LegacyClaimResult } from "@/lib/server/auth/claim";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { claimLegacyForCurrentSession, getFastAuthContext } from "@/lib/server/auth/session";
import { listProjects } from "@/lib/server/projects";
import type { Project } from "@/types/project";

export async function listHomeProjectsAction(): Promise<ActionResult<Project[]>> {
  return withAction(async () => {
    const context = await getFastAuthContext();
    return listProjects({
      ownerId: context.userId,
      workspaceId: context.workspaceId,
    });
  });
}

export async function runLegacyClaimBootstrapAction(): Promise<ActionResult<LegacyClaimResult | null>> {
  return withAction(async () => claimLegacyForCurrentSession());
}
