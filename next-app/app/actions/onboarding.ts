"use server";

import {
  getProjectOnboardingState,
  setProjectOnboardingState,
  type ProjectOnboardingState,
} from "@/lib/server/onboarding";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";

export async function getProjectOnboardingStateAction(projectId: string): Promise<ActionResult<ProjectOnboardingState>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      getProjectOnboardingState({ ownerId: userId, workspaceId }, projectId),
    ),
  );
}

export async function setProjectOnboardingOverrideAction(
  projectId: string,
  enabledOverride: boolean | null
): Promise<ActionResult<ProjectOnboardingState>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      setProjectOnboardingState({ ownerId: userId, workspaceId }, projectId, { enabledOverride }),
    ),
  );
}

export async function markProjectOnboardingCompletedAction(
  projectId: string,
  options?: { skipped?: boolean }
): Promise<ActionResult<ProjectOnboardingState>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) => {
    const now = new Date().toISOString();
      return setProjectOnboardingState({ ownerId: userId, workspaceId }, projectId, {
      completedAt: now,
      skippedAt: options?.skipped ? now : null,
    });
    }),
  );
}
