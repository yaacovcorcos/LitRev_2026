export type ProjectStatus = "harvesting" | "ready";

export interface ProjectProgress {
  phase: string;
  percent: number;
  papers: number;
}

export interface Project {
  id: string;
  demoKey?: string | null;
  name: string;
  description?: string;
  status: ProjectStatus;
  statusText: string;
  papers?: number;
  progress?: ProjectProgress;
  modified: string;
  created: string;
}
