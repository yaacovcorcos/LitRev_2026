import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ServiceScope } from "@/lib/server/scope";
import { requireScope } from "@/lib/server/scope";
import { Prisma } from "@prisma/client";

const GUIDED_SETUP_USER_KEY = "guided_setup_new_projects";
const DEFAULT_GUIDED_SETUP = true;

export type ProjectOnboardingState = {
  enabledOverride: boolean | null;
  completedAt: string | null;
  skippedAt: string | null;
};

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

  return {
    enabledOverride: typeof enabledOverrideRaw === "boolean" ? enabledOverrideRaw : null,
    completedAt: typeof completedAtRaw === "string" ? completedAtRaw : null,
    skippedAt: typeof skippedAtRaw === "string" ? skippedAtRaw : null,
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
  };

  return {
    ...root,
    onboarding: next,
  };
}

function isSchemaDriftColumnError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

export async function getGuidedSetupDefault(
  scopeInput: Partial<ServiceScope> | null | undefined
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
  scopeInput: Partial<ServiceScope> | null | undefined,
  enabled: boolean
): Promise<boolean> {
  const scope = requireScope(scopeInput ?? undefined);
  try {
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
  } catch (error) {
    if (!isSchemaDriftColumnError(error)) {
      throw error;
    }

    // Compatibility fallback for DBs that are missing newer lifecycle columns.
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
      },
      update: {
        type: "preference",
        value: enabled ? "1" : "0",
      },
    });
  }
  return enabled;
}

export async function getProjectOnboardingState(
  scopeInput: Partial<ServiceScope> | null | undefined,
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
  scopeInput: Partial<ServiceScope> | null | undefined,
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
    data: { progress: mergedProgress as any },
    select: { progress: true },
  });
  return parseProjectOnboarding(updated.progress);
}

export async function shouldLaunchGuidedSetupForProject(
  scopeInput: Partial<ServiceScope> | null | undefined,
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
