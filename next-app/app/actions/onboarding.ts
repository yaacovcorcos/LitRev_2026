"use server";

import { ensureSingleUserSeed } from "@/lib/server/bootstrap";
import {
  getGuidedSetupDefault,
  getProjectOnboardingState,
  setGuidedSetupDefault,
  setProjectOnboardingState,
  shouldLaunchGuidedSetupForProject,
  type ProjectOnboardingState,
} from "@/lib/server/onboarding";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";

export async function getGuidedSetupDefaultAction(): Promise<boolean> {
  await ensureSingleUserSeed(SINGLE_USER_SCOPE);
  return getGuidedSetupDefault(SINGLE_USER_SCOPE);
}

export async function setGuidedSetupDefaultAction(enabled: boolean): Promise<boolean> {
  await ensureSingleUserSeed(SINGLE_USER_SCOPE);
  return setGuidedSetupDefault(SINGLE_USER_SCOPE, enabled);
}

export async function getProjectOnboardingStateAction(projectId: string): Promise<ProjectOnboardingState> {
  await ensureSingleUserSeed(SINGLE_USER_SCOPE);
  return getProjectOnboardingState(SINGLE_USER_SCOPE, projectId);
}

export async function setProjectOnboardingOverrideAction(
  projectId: string,
  enabledOverride: boolean | null
): Promise<ProjectOnboardingState> {
  await ensureSingleUserSeed(SINGLE_USER_SCOPE);
  return setProjectOnboardingState(SINGLE_USER_SCOPE, projectId, { enabledOverride });
}

export async function markProjectOnboardingCompletedAction(
  projectId: string,
  options?: { skipped?: boolean }
): Promise<ProjectOnboardingState> {
  await ensureSingleUserSeed(SINGLE_USER_SCOPE);
  const now = new Date().toISOString();
  return setProjectOnboardingState(SINGLE_USER_SCOPE, projectId, {
    completedAt: now,
    skippedAt: options?.skipped ? now : null,
  });
}

export async function shouldLaunchGuidedSetupForProjectAction(projectId: string): Promise<boolean> {
  await ensureSingleUserSeed(SINGLE_USER_SCOPE);
  return shouldLaunchGuidedSetupForProject(SINGLE_USER_SCOPE, projectId);
}
