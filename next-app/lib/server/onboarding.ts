import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ScopeInput } from "@/lib/server/scope";
import { requireScope } from "@/lib/server/scope";
import type { Prisma } from "@prisma/client";
import type { OnboardingDerivedProfile } from "@/lib/server/onboarding-ai";

const GUIDED_SETUP_USER_KEY = "guided_setup_new_projects";
const DEFAULT_GUIDED_SETUP = true;

export type ProjectOnboardingState = {
  enabledOverride: boolean | null;
  completedAt: string | null;
  skippedAt: string | null;
  stepStatuses: Record<OnboardingStepId, OnboardingStepStatus>;
  derivedProfile: OnboardingDerivedProfile | null;
};

export type OnboardingStepId = "topicQuestion" | "pico" | "criteria" | "strategy" | "workflow" | "launch";
export type OnboardingStepStatus = "pending" | "completed" | "skipped";

function parseGuidedSetupValue(value: string | null | undefined): boolean {
  if (!value) return DEFAULT_GUIDED_SETUP;
  if (value === "1") return true;
  if (value === "0") return false;
  return DEFAULT_GUIDED_SETUP;
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseProjectOnboarding(progress: unknown): ProjectOnboardingState {
  const root = toObject(progress);
  const onboarding = toObject(root.onboarding);
  const enabledOverrideRaw = onboarding.enabledOverride;
  const completedAtRaw = onboarding.completedAt;
  const skippedAtRaw = onboarding.skippedAt;
  const stepStatusesRaw = toObject(onboarding.stepStatuses);
  const derivedProfileRaw = toObject(onboarding.derivedProfile);

  return {
    enabledOverride: typeof enabledOverrideRaw === "boolean" ? enabledOverrideRaw : null,
    completedAt: typeof completedAtRaw === "string" ? completedAtRaw : null,
    skippedAt: typeof skippedAtRaw === "string" ? skippedAtRaw : null,
    stepStatuses: {
      topicQuestion: toStepStatus(stepStatusesRaw.topicQuestion),
      pico: toStepStatus(stepStatusesRaw.pico),
      criteria: toStepStatus(stepStatusesRaw.criteria),
      strategy: toStepStatus(stepStatusesRaw.strategy),
      workflow: toStepStatus(stepStatusesRaw.workflow),
      launch: toStepStatus(stepStatusesRaw.launch),
    },
    derivedProfile: toDerivedProfile(derivedProfileRaw),
  };
}

function toStepStatus(value: unknown): OnboardingStepStatus {
  if (value === "completed" || value === "skipped") return value;
  return "pending";
}

function toDerivedProfile(raw: Record<string, unknown>): OnboardingDerivedProfile | null {
  const strictness = raw.strictness;
  const timelinePressure = raw.timelinePressure;
  const recallVsPrecision = raw.recallVsPrecision;
  const evidenceDepth = raw.evidenceDepth;

  if (
    (strictness !== "low" && strictness !== "moderate" && strictness !== "high") ||
    (timelinePressure !== "low" && timelinePressure !== "medium" && timelinePressure !== "high") ||
    (recallVsPrecision !== "recall" && recallVsPrecision !== "balanced" && recallVsPrecision !== "precision") ||
    (evidenceDepth !== "rapid" && evidenceDepth !== "standard" && evidenceDepth !== "comprehensive")
  ) {
    return null;
  }

  return {
    strictness,
    timelinePressure,
    recallVsPrecision,
    evidenceDepth,
  };
}

function mergeProjectOnboarding(
  progress: unknown,
  updates: Partial<ProjectOnboardingState>
): Record<string, unknown> {
  const root = toObject(progress);
  const previous = parseProjectOnboarding(progress);
  const next: ProjectOnboardingState = {
    enabledOverride:
      typeof updates.enabledOverride === "boolean" || updates.enabledOverride === null
        ? updates.enabledOverride
        : previous.enabledOverride,
    completedAt:
      typeof updates.completedAt === "string" || updates.completedAt === null
        ? updates.completedAt
        : previous.completedAt,
    skippedAt:
      typeof updates.skippedAt === "string" || updates.skippedAt === null
        ? updates.skippedAt
        : previous.skippedAt,
    stepStatuses: updates.stepStatuses
      ? {
          ...previous.stepStatuses,
          ...updates.stepStatuses,
        }
      : previous.stepStatuses,
    derivedProfile: updates.derivedProfile === undefined ? previous.derivedProfile : updates.derivedProfile,
  };

  return {
    ...root,
    onboarding: next,
  };
}

export async function getGuidedSetupDefault(
  scopeInput: ScopeInput
): Promise<boolean> {
  const scope = requireScope(scopeInput ?? undefined);
  const memory = await prisma.userMemory.findUnique({
    where: {
      userId_key: {
        userId: scope.ownerId,
        key: GUIDED_SETUP_USER_KEY,
      },
    },
    select: { value: true },
  });
  return parseGuidedSetupValue(memory?.value);
}

export async function setGuidedSetupDefault(
  scopeInput: ScopeInput,
  enabled: boolean
): Promise<boolean> {
  const scope = requireScope(scopeInput ?? undefined);
  await prisma.userMemory.upsert({
    where: {
      userId_key: {
        userId: scope.ownerId,
        key: GUIDED_SETUP_USER_KEY,
      },
    },
    create: {
      userId: scope.ownerId,
      type: "preference",
      key: GUIDED_SETUP_USER_KEY,
      value: enabled ? "1" : "0",
      rationale: "Controls whether new projects launch guided onboarding by default.",
      tags: ["onboarding", "settings"],
    },
    update: {
      type: "preference",
      value: enabled ? "1" : "0",
      rationale: "Controls whether new projects launch guided onboarding by default.",
      tags: ["onboarding", "settings"],
      status: "active",
      updatedAt: new Date(),
    },
  });
  return enabled;
}

export async function getProjectOnboardingState(
  scopeInput: ScopeInput,
  projectId: string
): Promise<ProjectOnboardingState> {
  await assertProjectAccess(scopeInput, projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { progress: true },
  });
  return parseProjectOnboarding(project?.progress);
}

export async function setProjectOnboardingState(
  scopeInput: ScopeInput,
  projectId: string,
  updates: Partial<ProjectOnboardingState>
): Promise<ProjectOnboardingState> {
  await assertProjectAccess(scopeInput, projectId);
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: { progress: true },
  });
  const mergedProgress = mergeProjectOnboarding(existing?.progress, updates);
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { progress: mergedProgress as Prisma.InputJsonValue },
    select: { progress: true },
  });
  return parseProjectOnboarding(updated.progress);
}

export async function shouldLaunchGuidedSetupForProject(
  scopeInput: ScopeInput,
  projectId: string
): Promise<boolean> {
  const [defaultEnabled, projectState] = await Promise.all([
    getGuidedSetupDefault(scopeInput),
    getProjectOnboardingState(scopeInput, projectId),
  ]);

  if (projectState.completedAt) return false;
  if (projectState.enabledOverride !== null) return projectState.enabledOverride;
  return defaultEnabled;
}
