import "server-only";

import { getActorContext } from "@/lib/server/actor";

const TEST_FALLBACK_USER_ID = "local-user";

type ResolveUserOptions = {
  errorMessage?: string;
  allowTestFallback?: boolean;
  testFallbackUserId?: string;
};

export type AuthenticatedIdentity = {
  userId: string;
  workspaceId?: string;
};

export function resolveAuthenticatedUserId(
  userId?: string,
  options: ResolveUserOptions = {},
): string {
  const explicit = userId?.trim();
  if (explicit) return explicit;

  const actor = getActorContext();
  if (actor?.userId) return actor.userId;

  const allowTestFallback = options.allowTestFallback !== false;
  if (allowTestFallback && process.env.NODE_ENV === "test") {
    return options.testFallbackUserId?.trim() || TEST_FALLBACK_USER_ID;
  }

  throw new Error(
    options.errorMessage || "Missing authenticated user context for AI service call.",
  );
}

export function resolveAuthenticatedIdentity(
  input?: { userId?: string; workspaceId?: string },
  options: ResolveUserOptions = {},
): AuthenticatedIdentity {
  const actor = getActorContext();
  const userId = resolveAuthenticatedUserId(input?.userId, options);
  const workspaceId = input?.workspaceId?.trim() || actor?.workspaceId;
  return { userId, workspaceId };
}
