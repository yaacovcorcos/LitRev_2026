"use server";

import { ensureSingleUserSeed } from "@/lib/server/bootstrap";
import {
  getProjectOnboardingState,
  setProjectOnboardingState,
  type ProjectOnboardingState,
} from "@/lib/server/onboarding";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { withAction, type ActionResult } from "@/lib/server/action-utils";

export async function getProjectOnboardingStateAction(projectId: string): Promise<ActionResult<ProjectOnboardingState>> {
  return withAction(async () => {
    await ensureSingleUserSeed(SINGLE_USER_SCOPE);
    return getProjectOnboardingState(SINGLE_USER_SCOPE, projectId);
  });
}

export async function setProjectOnboardingOverrideAction(
  projectId: string,
  enabledOverride: boolean | null
): Promise<ActionResult<ProjectOnboardingState>> {
  return withAction(async () => {
    await ensureSingleUserSeed(SINGLE_USER_SCOPE);
    return setProjectOnboardingState(SINGLE_USER_SCOPE, projectId, { enabledOverride });
  });
}

export async function markProjectOnboardingCompletedAction(
  projectId: string,
  options?: { skipped?: boolean }
): Promise<ActionResult<ProjectOnboardingState>> {
  return withAction(async () => {
    await ensureSingleUserSeed(SINGLE_USER_SCOPE);
    const now = new Date().toISOString();
    return setProjectOnboardingState(SINGLE_USER_SCOPE, projectId, {
      completedAt: now,
      skippedAt: options?.skipped ? now : null,
    });
  });
}
