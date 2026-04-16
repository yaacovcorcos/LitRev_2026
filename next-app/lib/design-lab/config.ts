export const DESIGN_LAB_VIEWPORTS = ["desktop", "tablet", "mobile"] as const;
export type DesignLabViewport = (typeof DESIGN_LAB_VIEWPORTS)[number];

export const DESIGN_LAB_STATES = ["default", "focused", "empty"] as const;
export type DesignLabState = (typeof DESIGN_LAB_STATES)[number];

export const DESIGN_LAB_DENSITIES = ["comfortable", "compact"] as const;
export type DesignLabDensity = (typeof DESIGN_LAB_DENSITIES)[number];

export const DESIGN_LAB_SURFACES = [
  {
    slug: "overview",
    title: "Project Overview",
    kicker: "Command center",
    summary: "The first screen for orienting around scope, readiness, and the next best move.",
  },
  {
    slug: "conversation",
    title: "Conversation",
    kicker: "Copilot workspace",
    summary: "The active reasoning lane with process receipts, suggestions, and queued work.",
  },
  {
    slug: "ledger",
    title: "Evidence Ledger",
    kicker: "Study operations",
    summary: "The dense study-management surface for triage, extraction, and evidence review.",
  },
  {
    slug: "draft",
    title: "Draft Studio",
    kicker: "Manuscript editor",
    summary: "The writing workspace where structure, evidence, and review context stay visible.",
  },
  {
    slug: "protocol",
    title: "Protocol",
    kicker: "Research plan",
    summary: "The structured review plan with criteria, scope, and operational guardrails.",
  },
  {
    slug: "memory",
    title: "Memory",
    kicker: "Knowledge graph",
    summary: "The long-lived knowledge layer for claims, themes, and reusable context.",
  },
  {
    slug: "notes",
    title: "Notes",
    kicker: "Working scratchpad",
    summary: "The lighter-weight collection of working notes, questions, and reminders.",
  },
] as const;

export type DesignLabSurfaceSlug = (typeof DESIGN_LAB_SURFACES)[number]["slug"];

function sanitizeEnumValue<T extends readonly string[]>(
  value: string | null | undefined,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (!value) return fallback;
  return allowed.includes(value) ? value : fallback;
}

export function sanitizeDesignLabViewport(value: string | null | undefined): DesignLabViewport {
  return sanitizeEnumValue(value, DESIGN_LAB_VIEWPORTS, "desktop");
}

export function sanitizeDesignLabState(value: string | null | undefined): DesignLabState {
  return sanitizeEnumValue(value, DESIGN_LAB_STATES, "default");
}

export function sanitizeDesignLabDensity(value: string | null | undefined): DesignLabDensity {
  return sanitizeEnumValue(value, DESIGN_LAB_DENSITIES, "comfortable");
}

export function getDesignLabSurface(slug: string): (typeof DESIGN_LAB_SURFACES)[number] | null {
  return DESIGN_LAB_SURFACES.find((surface) => surface.slug === slug) ?? null;
}
