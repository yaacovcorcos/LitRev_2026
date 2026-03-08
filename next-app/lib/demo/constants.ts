import type { Project } from "@/types/project";

export const DEMO_PROJECT_KEY = "sample-yoga-anxiety";

export const DEMO_PROJECT_NAME = "Yoga for Anxiety";

export const DEMO_PROJECT_DESCRIPTION =
  "Editable sample workspace based on real studies from Cramer et al. (2018).";

export const DEMO_PROJECT_STATUS_TEXT = "Sample";

export const DEMO_PROJECT_PAPERS = 16;

export function isDemoProjectKey(demoKey: string | null | undefined): boolean {
  return (demoKey ?? "").trim() === DEMO_PROJECT_KEY;
}

export function isDemoProject(project: Pick<Project, "demoKey"> | null | undefined): boolean {
  return isDemoProjectKey(project?.demoKey);
}
