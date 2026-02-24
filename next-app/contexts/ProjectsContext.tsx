"use client";

import { createProjectAction, deleteProjectAction, listProjectsAction } from "@/app/actions/projects";
import { migrateLocalStorageToBackend } from "@/lib/migrateLocalStorage";
import { Project } from "@/types/project";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ProjectsContextValue = {
  projects: Project[];
  isInitialized: boolean;
  addProject: (project: Project) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  getProjectById: (id: string) => Project | undefined;
  refresh: () => Promise<void>;
};

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await listProjectsAction();
      if (result.success) {
        setProjects(result.data);
      } else {
        console.error("Failed to load projects from backend:", result.error);
      }
    } catch (err) {
      console.error("Failed to load projects from backend", err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      try {
        const result = await migrateLocalStorageToBackend();
        if (result.error) {
          console.error("Migration completed with errors:", result.error);
        }
      } catch (err) {
        console.error("Local storage migration failed", err);
      } finally {
        if (isMounted) {
          await refresh();
          setIsInitialized(true);
        }
      }
    };
    run();
    return () => {
      isMounted = false;
    };
  }, [refresh]);

  const addProject = useCallback(async (project: Project): Promise<Project | null> => {
    try {
      const result = await createProjectAction(project);
      if (!result.success) {
        console.error("Failed to create project:", result.error);
        return null;
      }
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

  const value = useMemo(
    () => ({
      projects,
      isInitialized,
      addProject,
      deleteProject,
      getProjectById,
      refresh,
    }),
    [projects, isInitialized, addProject, deleteProject, getProjectById, refresh]
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
