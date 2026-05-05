import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/server/prisma";
import { normalizePostLoginCallbackUrl } from "@/lib/auth-redirects";

type EnvLike = {
  NODE_ENV?: string;
  ENABLE_DEV_QUICK_LOGIN?: string;
  VERCEL_ENV?: string;
};

export const DEV_QUICK_LOGIN_USER_ID = "preview-dev-user";
export const DEV_QUICK_LOGIN_EMAIL = "preview-dev-user@local.invalid";
export const DEV_QUICK_LOGIN_NAME = "Preview Dev User";
const DEV_QUICK_LOGIN_WORKSPACE_NAME = "Preview Dev Workspace";
const FIXTURE_DESCRIPTION_NAMESPACE = "[e2e-fixture";

export type DevQuickLoginIdentity = {
  seedKey: string | null;
  fixtureTag: string;
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
};

type RequestOriginLike = {
  headers: Pick<Headers, "get">;
  nextUrl: URL;
};

export function isDevQuickLoginAllowed(env: EnvLike = process.env): boolean {
  // Always allow in local/dev runtime for fast iteration.
  if (env.NODE_ENV !== "production") return true;
  // In production runtime, allow only on preview deployments with explicit flag.
  return env.VERCEL_ENV === "preview" && env.ENABLE_DEV_QUICK_LOGIN === "1";
}

function getRequestOrigin(request: RequestOriginLike): string {
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  return `${proto}://${host}`;
}

export function hasTrustedDevQuickLoginOrigin(request: RequestOriginLike): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }
  return origin === getRequestOrigin(request);
}

export function normalizeCallbackUrl(input: string | null | undefined): string {
  return normalizePostLoginCallbackUrl(input);
}

export function normalizeDevQuickLoginSeedKey(input: string | null | undefined): string | null {
  const normalized = input?.trim();
  if (!normalized) return null;
  return normalized.slice(0, 120);
}

function hashSeedKey(seedKey: string): string {
  return createHash("sha256").update(seedKey).digest("hex").slice(0, 12);
}

export function getDevQuickLoginIdentity(seedKey?: string | null): DevQuickLoginIdentity {
  const normalizedSeedKey = normalizeDevQuickLoginSeedKey(seedKey);
  if (!normalizedSeedKey) {
    return {
      seedKey: null,
      fixtureTag: `${FIXTURE_DESCRIPTION_NAMESPACE}:default]`,
      userId: DEV_QUICK_LOGIN_USER_ID,
      email: DEV_QUICK_LOGIN_EMAIL,
      name: DEV_QUICK_LOGIN_NAME,
      workspaceId: `workspace-${DEV_QUICK_LOGIN_USER_ID}`,
      workspaceName: DEV_QUICK_LOGIN_WORKSPACE_NAME,
    };
  }

  const seedHash = hashSeedKey(normalizedSeedKey);
  const shortHash = seedHash.slice(0, 6);

  return {
    seedKey: normalizedSeedKey,
    fixtureTag: `${FIXTURE_DESCRIPTION_NAMESPACE}:${seedHash}]`,
    userId: `${DEV_QUICK_LOGIN_USER_ID}-${seedHash}`,
    email: `preview-dev-user+${seedHash}@local.invalid`,
    name: `${DEV_QUICK_LOGIN_NAME} ${shortHash}`,
    workspaceId: `workspace-${DEV_QUICK_LOGIN_USER_ID}-${seedHash}`,
    workspaceName: `${DEV_QUICK_LOGIN_WORKSPACE_NAME} ${shortHash}`,
  };
}

export function buildFixtureProjectDescription(
  seedKey: string | null | undefined,
  description?: string | null,
): string {
  const trimmedDescription = description?.trim();
  const { fixtureTag } = getDevQuickLoginIdentity(seedKey);
  return trimmedDescription ? `${fixtureTag} ${trimmedDescription}` : `${fixtureTag} E2E seeded test project`;
}

export function isSeededFixtureProject(
  project: { description: string | null; demoKey: string | null },
  seedKey: string | null | undefined,
): boolean {
  const { fixtureTag } = getDevQuickLoginIdentity(seedKey);
  return project.demoKey !== null || project.description?.startsWith(fixtureTag) === true;
}

export function createDevFixtureProjectId(prefix = "project"): string {
  return `${prefix}-${randomUUID()}`;
}

export async function ensureDevQuickLoginIdentity(
  seedKey?: string | null,
): Promise<DevQuickLoginIdentity> {
  const identity = getDevQuickLoginIdentity(seedKey);

  await prisma.user.upsert({
    where: { id: identity.userId },
    update: {
      email: identity.email,
      name: identity.name,
      emailVerified: true,
    },
    create: {
      id: identity.userId,
      email: identity.email,
      name: identity.name,
      emailVerified: true,
    },
  });

  await prisma.workspace.upsert({
    where: { id: identity.workspaceId },
    update: { name: identity.workspaceName },
    create: {
      id: identity.workspaceId,
      name: identity.workspaceName,
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: identity.workspaceId,
        userId: identity.userId,
      },
    },
    update: { role: "owner" },
    create: {
      workspaceId: identity.workspaceId,
      userId: identity.userId,
      role: "owner",
    },
  });

  return identity;
}
