"use client";

import { useEffect, useState } from "react";
import { useProjects } from "@/contexts/ProjectsContext";
import type { Project } from "@/types/project";

type UseResolvedProjectResult = {
  project: Project | undefined;
  isResolvingProject: boolean;
  projectsError: string | null;
  isLoadingProjects: boolean;
};

export function useResolvedProject(projectId: string | undefined): UseResolvedProjectResult {
  const { getProjectById, ensureProjectLoaded, isLoadingProjects, projectsError } = useProjects();
  const [resolvedProject, setResolvedProject] = useState<Project | null>(null);
  const [isResolvingProject, setIsResolvingProject] = useState(false);
  const [hasAttemptedResolve, setHasAttemptedResolve] = useState(false);

  const project = projectId ? getProjectById(projectId) ?? resolvedProject ?? undefined : undefined;

  useEffect(() => {
    setResolvedProject(null);
    setIsResolvingProject(false);
    setHasAttemptedResolve(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || project || isLoadingProjects || projectsError || hasAttemptedResolve) return;

    let cancelled = false;
    setIsResolvingProject(true);

    void ensureProjectLoaded(projectId)
      .then((loadedProject) => {
        if (cancelled || !loadedProject) return;
        setResolvedProject(loadedProject);
      })
      .finally(() => {
        if (cancelled) return;
        setHasAttemptedResolve(true);
        setIsResolvingProject(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ensureProjectLoaded, hasAttemptedResolve, isLoadingProjects, project, projectId, projectsError]);

  return {
    project,
    isResolvingProject,
    projectsError,
    isLoadingProjects,
  };
}
