export const DEMO_PROJECT_ID = "sample-yoga-anxiety";

export const DEMO_PROJECT_NAME = "Sample Review: Yoga for Anxiety";

export const DEMO_PROJECT_DESCRIPTION =
  "Editable sample workspace based on real studies from Cramer et al. (2018).";

export const DEMO_PROJECT_STATUS_TEXT = "Status: Sample Review";

export const DEMO_PROJECT_PAPERS = 12;

export function isDemoProjectId(projectId: string | null | undefined): boolean {
  return (projectId ?? "").trim() === DEMO_PROJECT_ID;
}
