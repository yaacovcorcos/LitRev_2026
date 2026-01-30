"use client";

import { createProjectAction, deleteProjectAction, listProjectsAction } from "@/app/actions/projects";
import { migrateLocalStorageToBackend } from "@/lib/migrateLocalStorage";
import { seedLocalStorageIfEmpty } from "@/lib/seedLocalStorage";
import { loadProjects, saveProjects } from "@/lib/storage";
import { Project } from "@/types/project";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ProjectsContextValue = {
  projects: Project[];
  addProject: (project: Project) => void;
  deleteProject: (id: string) => void;
  getProjectById: (id: string) => Project | undefined;
  refresh: () => void;
};

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);

  const refresh = useCallback(() => {
    listProjectsAction()
      .then((loaded) => {
        setProjects(loaded);
      })
      .catch((err) => {
        console.error("Failed to load projects from backend", err);
        seedLocalStorageIfEmpty();
        setProjects(loadProjects([]));
      });
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
          refresh();
        }
      }
    };
    run();
    return () => {
      isMounted = false;
    };
  }, [refresh]);

  const addProject = useCallback((project: Project) => {
    createProjectAction(project)
      .then((created) => {
        setProjects((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      })
      .catch((err) => {
        console.error("Failed to create project", err);
        const existing = loadProjects([]);
        const next = [project, ...existing.filter((p) => p.id !== project.id)];
        saveProjects(next);
        setProjects(next);
      });
  }, []);

  const deleteProject = useCallback((id: string) => {
    deleteProjectAction(id)
      .then(() => {
        setProjects((prev) => prev.filter((project) => project.id !== id));
      })
      .catch((err) => {
        console.error("Failed to delete project", err);
        const existing = loadProjects([]);
        const next = existing.filter((project) => project.id !== id);
        saveProjects(next);
        setProjects(next);
      });
  }, []);

  const getProjectById = useMemo(
    () => (id: string) => projects.find((p) => p.id === id),
    [projects]
  );

  const value = useMemo(
    () => ({
      projects,
      addProject,
      deleteProject,
      getProjectById,
      refresh,
    }),
    [projects, addProject, deleteProject, getProjectById, refresh]
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
