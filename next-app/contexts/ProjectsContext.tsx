"use client";

import { runLegacyClaimBootstrapAction, listHomeProjectsAction } from "@/app/actions/home";
import {
  createProjectAction,
  deleteProjectAction,
  getProjectAction,
  listProjectsAction,
} from "@/app/actions/projects";
import { isAuthError, redirectToLogin } from "@/lib/action-client";
import { authClient } from "@/lib/auth-client";
import {
  getLocalStorageMigrationStatus,
  migrateLocalStorageToBackend,
  type MigrationStatus,
} from "@/lib/migrate-local-storage";
import { HOME_PROJECT_STALE_MS } from "@/lib/project-data-policy";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { HomeAuthState, HomeBootstrapState, HomeWorkspaceBootstrap } from "@/types/home-bootstrap";
import type { Project } from "@/types/project";
const LEGACY_CLAIM_SESSION_KEY = "litrev:legacyClaimBootstrap:v1";
const HOME_BOOTSTRAP_TEMPLATE_ID = "litrev-home-bootstrap";

declare global {
  interface Window {
    __litrevHomeBootstrap?: HomeWorkspaceBootstrap;
  }
}

type ProjectsContextValue = {
  projects: Project[];
  authState: HomeAuthState;
  homeBootstrapState: HomeBootstrapState;
  usedSeededBootstrap: boolean;
  isInitialized: boolean;
  isLoadingProjects: boolean;
  projectsError: string | null;
  migrationStatus: MigrationStatus;
  migrationError: string | null;
  retryMigration: () => Promise<void>;
  addProject: (project: Project) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  getProjectById: (id: string) => Project | undefined;
  ensureProjectLoaded: (id: string) => Promise<Project | null>;
  refresh: () => Promise<void>;
};

type ProjectsProviderProps = {
  children: React.ReactNode;
  initialBootstrap?: HomeWorkspaceBootstrap | null;
};

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

function readWindowHomeBootstrap(): HomeWorkspaceBootstrap | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.__litrevHomeBootstrap ?? null;
}

function readTemplateHomeBootstrap(): HomeWorkspaceBootstrap | null {
  if (typeof document === "undefined") {
    return null;
  }

  const template = document.getElementById(HOME_BOOTSTRAP_TEMPLATE_ID);
  if (!(template instanceof HTMLTemplateElement)) {
    return null;
  }

  const raw = template.innerHTML.trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as HomeWorkspaceBootstrap;
  } catch (error) {
    console.error("Failed to parse homepage bootstrap template", error);
    return null;
  }
}

function resolveInitialBootstrap(input?: HomeWorkspaceBootstrap | null): HomeWorkspaceBootstrap | null {
  return input ?? readTemplateHomeBootstrap() ?? readWindowHomeBootstrap();
}

function deriveHomeBootstrapState(
  authState: HomeAuthState,
  projects: Project[],
  hasLoaded: boolean,
): HomeBootstrapState {
  if (authState === "unauthenticated") {
    return "unauthenticated";
  }
  if (!hasLoaded) {
    return "loading_unknown";
  }
  return projects.length > 0 ? "loaded_nonempty" : "loaded_empty";
}

function hasFreshHomeSeed(loadedAt: number | null): boolean {
  return loadedAt !== null && Date.now() - loadedAt < HOME_PROJECT_STALE_MS;
}

export function ProjectsProvider({ children, initialBootstrap }: ProjectsProviderProps) {
  const initialSeed = resolveInitialBootstrap(initialBootstrap);
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>(() => initialSeed?.initialProjects ?? []);
  const [authState, setAuthState] = useState<HomeAuthState>(() => initialSeed?.authState ?? "unknown");
  const [homeBootstrapState, setHomeBootstrapState] = useState<HomeBootstrapState>(
    () => initialSeed?.homeBootstrapState ?? "loading_unknown",
  );
  const [usedSeededBootstrap] = useState<boolean>(() => Boolean(initialSeed));
  const [isInitialized, setIsInitialized] = useState(() => initialSeed?.authState !== "unknown");
  const [isLoadingProjects, setIsLoadingProjects] = useState(
    () => !(initialSeed?.initialProjectsLoaded ?? false) && initialSeed?.authState !== "unauthenticated",
  );
  const [projectsError, setProjectsError] = useState<string | null>(() => initialSeed?.error ?? null);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus>("pending");
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const migrationInFlightRef = useRef(false);
  const projectsLoadedAtRef = useRef<number | null>(initialSeed?.loadedAt ?? null);
  const hasLoadedProjectsRef = useRef(Boolean(initialSeed?.initialProjectsLoaded));
  const hasLocalMutationRef = useRef(false);
  const claimBootstrapStartedRef = useRef(false);
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const refresh = useCallback(async () => {
    if (isSessionPending) return;
    if (!session) {
      setProjects([]);
      setAuthState("unauthenticated");
      setHomeBootstrapState("unauthenticated");
      setIsLoadingProjects(false);
      setProjectsError(null);
      setIsInitialized(true);
      hasLoadedProjectsRef.current = false;
      projectsLoadedAtRef.current = null;
      return;
    }

    setAuthState("authenticated");
    setIsLoadingProjects(true);
    setProjectsError(null);

    try {
      const result = pathname === "/" ? await listHomeProjectsAction() : await listProjectsAction();
      if (result.success) {
        setProjects(result.data);
        setProjectsError(null);
        hasLoadedProjectsRef.current = true;
        projectsLoadedAtRef.current = Date.now();
        hasLocalMutationRef.current = false;
        setHomeBootstrapState(deriveHomeBootstrapState("authenticated", result.data, true));
      } else if (isAuthError(result)) {
        redirectToLogin();
      } else {
        console.error("Failed to load projects from backend:", result.error);
        setProjectsError(result.error);
        if (!hasLoadedProjectsRef.current) {
          setHomeBootstrapState("loading_unknown");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load projects";
      console.error("Failed to load projects from backend", err);
      setProjectsError(message);
      if (!hasLoadedProjectsRef.current) {
        setHomeBootstrapState("loading_unknown");
      }
    } finally {
      setIsLoadingProjects(false);
      setIsInitialized(true);
    }
  }, [isSessionPending, pathname, session]);

  const runMigration = useCallback(
    async (force = false) => {
      if (migrationInFlightRef.current) return;
      if (isSessionPending || !session) return;

      migrationInFlightRef.current = true;
      setMigrationError(null);
      const startedAt = Date.now();

      try {
        const result = await migrateLocalStorageToBackend({ force, timeoutMs: 10_000 });
        setMigrationStatus(result.status);

        const durationMs = Date.now() - startedAt;
        if (result.error) {
          setMigrationError(result.error);
          console.error(`[migration] status=${result.status} durationMs=${durationMs} error=${result.error}`);
        } else {
          console.info(`[migration] status=${result.status} durationMs=${durationMs}`);
        }

        if (result.migrated || force) {
          await refresh();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Migration failed unexpectedly";
        setMigrationStatus("failed");
        setMigrationError(message);
        console.error(`[migration] status=failed durationMs=${Date.now() - startedAt} error=${message}`);
      } finally {
        migrationInFlightRef.current = false;
      }
    },
    [isSessionPending, refresh, session],
  );

  const retryMigration = useCallback(async () => {
    await runMigration(true);
  }, [runMigration]);

  useEffect(() => {
    if (isSessionPending) {
      if (usedSeededBootstrap || authState !== "unknown") {
        setIsInitialized(true);
      }
      return;
    }

    if (!session) {
      setProjects([]);
      setAuthState("unauthenticated");
      setHomeBootstrapState("unauthenticated");
      setIsLoadingProjects(false);
      setProjectsError(null);
      setMigrationStatus("pending");
      setMigrationError(null);
      setIsInitialized(true);
      hasLoadedProjectsRef.current = false;
      projectsLoadedAtRef.current = null;
      return;
    }

    setAuthState("authenticated");
    setIsInitialized(true);

    const shouldRefreshFromSeed =
      !hasLoadedProjectsRef.current ||
      hasLocalMutationRef.current ||
      !hasFreshHomeSeed(projectsLoadedAtRef.current);

    if (shouldRefreshFromSeed) {
      void refresh();
    } else {
      setIsLoadingProjects(false);
    }

    const status = getLocalStorageMigrationStatus();
    setMigrationStatus(status);
    if (status !== "failed" && status !== "done") {
      void runMigration(false);
    }
  }, [authState, isSessionPending, refresh, runMigration, session, usedSeededBootstrap]);

  useEffect(() => {
    if (isSessionPending || !session || claimBootstrapStartedRef.current) {
      return;
    }

    if (typeof window !== "undefined" && window.sessionStorage.getItem(LEGACY_CLAIM_SESSION_KEY) === "1") {
      claimBootstrapStartedRef.current = true;
      return;
    }

    claimBootstrapStartedRef.current = true;
    let cancelled = false;

    const schedule =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? window.requestIdleCallback(async () => {
            if (cancelled) return;
            const result = await runLegacyClaimBootstrapAction();
            if (!cancelled && result.success) {
              window.sessionStorage.setItem(LEGACY_CLAIM_SESSION_KEY, "1");
            }
          })
        : globalThis.setTimeout(async () => {
            if (cancelled) return;
            const result = await runLegacyClaimBootstrapAction();
            if (!cancelled && result.success) {
              window.sessionStorage.setItem(LEGACY_CLAIM_SESSION_KEY, "1");
            }
          }, 0);

    return () => {
      cancelled = true;
      if (typeof schedule === "number") {
        if (typeof window !== "undefined" && "cancelIdleCallback" in window) {
          window.cancelIdleCallback(schedule);
        } else {
          globalThis.clearTimeout(schedule);
        }
      }
    };
  }, [isSessionPending, session]);

  const addProject = useCallback(async (project: Project): Promise<Project | null> => {
    try {
      const result = await createProjectAction(project);
      if (!result.success) {
        console.error("Failed to create project:", result.error);
        return null;
      }
      hasLocalMutationRef.current = true;
      hasLoadedProjectsRef.current = true;
      projectsLoadedAtRef.current = Date.now();
      setAuthState("authenticated");
      setProjectsError(null);
      setProjects((prev) => [result.data, ...prev.filter((p) => p.id !== result.data.id)]);
      setHomeBootstrapState("loaded_nonempty");
      return result.data;
    } catch (err) {
      console.error("Failed to create project", err);
      return null;
    }
  }, []);

  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    try {
      const result = await deleteProjectAction(id);
      if (!result.success) {
        console.error("Failed to delete project:", result.error);
        return false;
      }
      hasLocalMutationRef.current = true;
      hasLoadedProjectsRef.current = true;
      projectsLoadedAtRef.current = Date.now();
      setProjects((prev) => {
        const next = prev.filter((project) => project.id !== id);
        setHomeBootstrapState(next.length > 0 ? "loaded_nonempty" : "loaded_empty");
        return next;
      });
      return true;
    } catch (err) {
      console.error("Failed to delete project", err);
      return false;
    }
  }, []);

  const getProjectById = useMemo(
    () => (id: string) => projects.find((project) => project.id === id),
    [projects],
  );

  const ensureProjectLoaded = useCallback(async (id: string): Promise<Project | null> => {
    const existingProject = projects.find((project) => project.id === id);
    if (existingProject) {
      return existingProject;
    }

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await getProjectAction(id);
        if (!result.success) {
          if (isAuthError(result)) {
            redirectToLogin();
          } else {
            console.error("Failed to load project from backend:", result.error);
          }
          return null;
        }

        if (result.data) {
          hasLoadedProjectsRef.current = true;
          projectsLoadedAtRef.current = Date.now();
          setProjects((prev) => {
            const next = prev.filter((project) => project.id !== result.data!.id);
            return [result.data!, ...next];
          });
          setAuthState("authenticated");
          setHomeBootstrapState("loaded_nonempty");
          setProjectsError(null);
          return result.data;
        }

        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      return null;
    } catch (err) {
      console.error("Failed to load project from backend", err);
      return null;
    }
  }, [projects]);

  const value = useMemo(
    () => ({
      projects,
      authState,
      homeBootstrapState,
      usedSeededBootstrap,
      isInitialized,
      isLoadingProjects,
      projectsError,
      migrationStatus,
      migrationError,
      retryMigration,
      addProject,
      deleteProject,
      getProjectById,
      ensureProjectLoaded,
      refresh,
    }),
    [
      addProject,
      authState,
      deleteProject,
      ensureProjectLoaded,
      getProjectById,
      homeBootstrapState,
      isInitialized,
      isLoadingProjects,
      migrationError,
      migrationStatus,
      projects,
      projectsError,
      refresh,
      retryMigration,
      usedSeededBootstrap,
    ],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return ctx;
}
