import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export type ActorContext = {
  userId: string;
  workspaceId: string;
  role: string;
};

const actorStorage = new AsyncLocalStorage<ActorContext>();

export function runWithActorContext<T>(actor: ActorContext, fn: () => T): T {
  return actorStorage.run(actor, fn);
}

export function getActorContext(): ActorContext | null {
  return actorStorage.getStore() ?? null;
}

export function requireActorContext(): ActorContext {
  const actor = getActorContext();
  if (!actor) {
    throw new Error("No authenticated actor context available.");
  }
  return actor;
}

export function getActorServiceScope():
  | { ownerId: string; workspaceId: string }
  | null {
  const actor = getActorContext();
  if (!actor) return null;
  return {
    ownerId: actor.userId,
    workspaceId: actor.workspaceId,
  };
}
