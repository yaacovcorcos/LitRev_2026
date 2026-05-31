/**
 * Project Memory Types
 * TypeScript types for the memory management system
 */

export type ProjectMemoryType = "decision" | "definition" | "criterion" | "goal";
export type ProjectMemoryCategory = "inclusion" | "exclusion" | "outcome" | "population" | "intervention" | "comparison";
export type ProjectMemoryStatus = "active" | "revised" | "archived";
export type ProjectMemoryImportance = "critical" | "important" | "normal";

// Prisma returns looser types, so we use string where Prisma uses String
export interface ProjectMemory {
  id: string;
  projectId: string;
  type: string; // ProjectMemoryType at runtime
  key?: string | null;
  category?: string | null; // ProjectMemoryCategory at runtime
  statement: string;
  rationale?: string | null;
  context?: string | null;
  status: string; // ProjectMemoryStatus at runtime
  source: string;
  authority: string;
  polarity: string;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
  confidence: number;
  pinned: boolean;
  embeddingStatus?: string;
  lastUsedAt?: Date | null;
  version: number;
  supersededBy?: string | null;
  tags: string[];
  importance: string; // ProjectMemoryImportance at runtime
  importanceRank?: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export const MEMORY_TYPE_LABELS: Record<ProjectMemoryType, string> = {
  decision: "Decision",
  definition: "Definition",
  criterion: "Criterion",
  goal: "Goal",
};

export const MEMORY_TYPE_ICONS: Record<ProjectMemoryType, string> = {
  decision: "gavel",
  definition: "menu_book",
  criterion: "checklist",
  goal: "flag",
};

export const MEMORY_CATEGORY_LABELS: Record<ProjectMemoryCategory, string> = {
  inclusion: "Inclusion",
  exclusion: "Exclusion",
  outcome: "Outcome",
  population: "Population",
  intervention: "Intervention",
  comparison: "Comparison",
};

export const MEMORY_IMPORTANCE_LABELS: Record<ProjectMemoryImportance, string> = {
  critical: "Critical",
  important: "Important",
  normal: "Normal",
};
