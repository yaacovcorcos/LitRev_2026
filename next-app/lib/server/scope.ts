import "server-only";

export type ServiceScope = {
  ownerId: string;
  workspaceId: string;
};

export const SINGLE_USER_SCOPE: ServiceScope = {
  ownerId: "local-user",
  workspaceId: "local-workspace",
};

export function requireScope(scope?: Partial<ServiceScope> | null): ServiceScope {
  const ownerId = scope?.ownerId?.trim();
  const workspaceId = scope?.workspaceId?.trim();
  if (!ownerId || !workspaceId) {
    throw new Error("Service scope requires ownerId and workspaceId.");
  }
  return { ownerId, workspaceId };
}
