import "server-only";

import { getActorServiceScope } from "@/lib/server/actor";

export type ServiceScope = {
  ownerId: string;
  workspaceId: string;
};

export type ScopeInput = Partial<ServiceScope> | null | undefined;

export function requireScope(scope?: ScopeInput): ServiceScope {
  const ownerId = scope?.ownerId?.trim();
  const workspaceId = scope?.workspaceId?.trim();
  if (ownerId && workspaceId) {
    return { ownerId, workspaceId };
  }

  const actorScope = getActorServiceScope();
  if (actorScope) {
    return actorScope;
  }

  throw new Error("Service scope requires ownerId and workspaceId.");
}
