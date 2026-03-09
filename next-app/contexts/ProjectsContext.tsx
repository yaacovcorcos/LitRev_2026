"use client";

import { createProjectAction, deleteProjectAction, getProjectAction, listProjectsAction } from "@/app/actions/projects";
import {
  getLocalStorageMigrationStatus,
  migrateLocalStorageToBackend,
  type MigrationStatus,
} from "@/lib/migrateLocalStorage";
import { authClient } from "@/lib/auth-client";
import { isAuthError, redirectToLogin } from "@/lib/action-client";
import { Project } from "@/types/project";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ProjectsContextValue = {
  projects: Project[];
  isInitialized: boolean;
  /** True while the initial project list fetch is in-flight. */
  isLoadingProjects: boolean;
  /** Non-null if the last project list fetch failed. */
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

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus>("pending");
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const migrationInFlightRef = useRef(false);
  const retainedProjectIdsRef = useRef<Set<string>>(new Set());
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const refresh = useCallback(async () => {
    if (isSessionPending) return;
    if (!session) {
      setProjects([]);
      setIsLoadingProjects(false);
      return;
    }

    setIsLoadingProjects(true);
    setProjectsError(null);

    try {
      const result = await listProjectsAction();
      if (result.success) {
        const fetchedProjects = result.data;
        setProjects((prev) => {
          const retainedProjects = prev.filter(
            (project) =>
              retainedProjectIdsRef.current.has(project.id) &&
              !fetchedProjects.some((candidate) => candidate.id === project.id),
          );
          for (const project of fetchedProjects) {
            retainedProjectIdsRef.current.delete(project.id);
          }
          return [...retainedProjects, ...fetchedProjects];
        });
        setProjectsError(null);
      } else if (isAuthError(result)) {
        redirectToLogin();
      } else {
        console.error("Failed to load projects from backend:", result.error);
        setProjectsError(result.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load projects";
      console.error("Failed to load projects from backend", err);
      setProjectsError(message);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [isSessionPending, session]);

  const runMigration = useCallback(
    async (force = false) => {
      if (migrationInFlightRef.current) return;
      if (isSessionPending || !session) return;

      migrationInFlightRef.current = true;
      setMigrationError(null);
      const startedAt = Date.now();

      try {
        const result = await migrateLocalStorageToBackend({ force, timeoutMs: 10000 });
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
    [isSessionPending, refresh, session]
  );

  const retryMigration = useCallback(async () => {
    await runMigration(true);
  }, [runMigration]);

  useEffect(() => {
    if (isSessionPending) {
      // Never block app entry on a long/pending session lookup.
      setIsInitialized(true);
      return;
    }

    if (!session) {
      setProjects([]);
      setIsLoadingProjects(false);
      setProjectsError(null);
      setMigrationStatus("pending");
      setMigrationError(null);
      setIsInitialized(true);
      return;
    }

    // Fast startup: render app immediately; migration runs in background.
    setIsInitialized(true);
    void refresh();

    const status = getLocalStorageMigrationStatus();
    setMigrationStatus(status);
    if (status === "failed" || status === "done") {
      return;
    }
    void runMigration(false);
  }, [isSessionPending, refresh, runMigration, session]);

  const addProject = useCallback(async (project: Project): Promise<Project | null> => {
    try {
      const result = await createProjectAction(project);
      if (!result.success) {
        console.error("Failed to create project:", result.error);
        return null;
      }
      retainedProjectIdsRef.current.add(result.data.id);
      setProjects((prev) => [result.data, ...prev.filter((p) => p.id !== result.data.id)]);
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
      retainedProjectIdsRef.current.delete(id);
      setProjects((prev) => prev.filter((project) => project.id !== id));
      return true;
    } catch (err) {
      console.error("Failed to delete project", err);
      return false;
    }
  }, []);

  const getProjectById = useMemo(
    () => (id: string) => projects.find((p) => p.id === id),
    [projects]
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
          retainedProjectIdsRef.current.add(result.data.id);
          setProjects((prev) => {
            const next = prev.filter((project) => project.id !== result.data!.id);
            return [result.data!, ...next];
          });
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
      projects,
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
    ]
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
