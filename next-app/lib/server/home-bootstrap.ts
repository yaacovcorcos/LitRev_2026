import "server-only";

import { sanitizeErrorMessage } from "@/lib/server/action-utils";
import { getOptionalFastAuthSessionContext } from "@/lib/server/auth/session";
import { listProjects } from "@/lib/server/projects";
import type { HomeWorkspaceBootstrap } from "@/types/home-bootstrap";

export async function getHomeWorkspaceBootstrap(): Promise<HomeWorkspaceBootstrap> {
  const sessionContext = await getOptionalFastAuthSessionContext();
  if (!sessionContext) {
    return {
      authState: "unauthenticated",
      homeBootstrapState: "unauthenticated",
      initialProjects: [],
      initialProjectsLoaded: false,
      loadedAt: null,
      userName: null,
      error: null,
    };
  }

  try {
    const projects = await listProjects({
      ownerId: sessionContext.context.userId,
      workspaceId: sessionContext.context.workspaceId,
    });

    return {
      authState: "authenticated",
      homeBootstrapState: projects.length > 0 ? "loaded_nonempty" : "loaded_empty",
      initialProjects: projects,
      initialProjectsLoaded: true,
      loadedAt: Date.now(),
      userName: sessionContext.sessionUser.name ?? null,
      error: null,
    };
  } catch (error) {
    return {
      authState: "authenticated",
      homeBootstrapState: "loading_unknown",
      initialProjects: [],
      initialProjectsLoaded: false,
      loadedAt: null,
      userName: sessionContext.sessionUser.name ?? null,
      error: sanitizeErrorMessage(
        error,
        "Unable to load your workspace right now. Please try again.",
      ),
    };
  }
}
