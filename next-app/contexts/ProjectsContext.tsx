"use client";

import { defaultProjects } from "@/data/projects";
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
  const [projects, setProjects] = useState<Project[]>(defaultProjects);

  useEffect(() => {
    const seeded = loadProjects(defaultProjects);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjects(seeded.length ? seeded : defaultProjects);
  }, []);

  const addProject = useCallback((project: Project) => {
    setProjects((prev) => {
      const next = [project, ...prev];
      saveProjects(next);
      return next;
    });
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => {
      const next = prev.filter((project) => project.id !== id);
      saveProjects(next);
      return next.length ? next : defaultProjects;
    });
  }, []);

  const refresh = useCallback(() => {
    const loaded = loadProjects(defaultProjects);
    setProjects(loaded.length ? loaded : defaultProjects);
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
