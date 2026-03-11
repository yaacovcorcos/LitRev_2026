import type { Project } from "@/types/project";

export type HomeAuthState = "authenticated" | "unauthenticated" | "unknown";

export type HomeBootstrapState =
  | "loading_unknown"
  | "loaded_empty"
  | "loaded_nonempty"
  | "unauthenticated";

export type HomeWorkspaceBootstrap = {
  authState: HomeAuthState;
  homeBootstrapState: HomeBootstrapState;
  initialProjects: Project[];
  initialProjectsLoaded: boolean;
  loadedAt: number | null;
  userName: string | null;
  error: string | null;
};
