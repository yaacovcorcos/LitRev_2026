import type { ChatSurface } from "@/types/chat-unification";

const MIN_BURN_IN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SAMPLE_ROWS_PER_SURFACE = 5;
const SURFACES: ChatSurface[] = ["ai", "project"];

export function parseIsoDateArg(
  name: string,
  raw: string | undefined,
  required = false,
): Date | undefined {
  if (!raw) {
    if (!required) return undefined;
    throw new Error(`Missing required --${name}=<iso-date> argument`);
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid ISO timestamp for --${name}: ${raw}`);
  }
  return new Date(timestamp);
}

export function parseCsvIdArg(name: string, raw: string | undefined): string[] | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (ids.length === 0) {
    throw new Error(`Invalid --${name} list: provide at least one non-empty id`);
  }
  return Array.from(new Set(ids));
}

export type CohortScope = {
  workspaceIds: string[] | null;
  userIds: string[] | null;
};

export function hasCohortScope(scope: CohortScope): boolean {
  return (scope.workspaceIds?.length ?? 0) > 0 || (scope.userIds?.length ?? 0) > 0;
}

export function buildCohortWhereInput(scope: CohortScope): {
  workspaceId?: { in: string[] };
  userId?: { in: string[] };
  OR?: Array<{ workspaceId?: { in: string[] }; userId?: { in: string[] } }>;
} {
  const where: {
    workspaceId?: { in: string[] };
    userId?: { in: string[] };
    OR?: Array<{ workspaceId?: { in: string[] }; userId?: { in: string[] } }>;
  } = {};

  const hasWorkspaces = (scope.workspaceIds?.length ?? 0) > 0;
  const hasUsers = (scope.userIds?.length ?? 0) > 0;

  if (hasWorkspaces && hasUsers) {
    where.OR = [
      { workspaceId: { in: scope.workspaceIds as string[] } },
      { userId: { in: scope.userIds as string[] } },
    ];
    return where;
  }

  if (hasWorkspaces) {
    where.workspaceId = { in: scope.workspaceIds as string[] };
  }
  if (hasUsers) {
    where.userId = { in: scope.userIds as string[] };
  }

  return where;
}

export function formatCohortScope(scope: CohortScope): string {
  if (!hasCohortScope(scope)) return "all-traffic (no cohort filter)";
  const parts: string[] = [];
  if (scope.workspaceIds?.length) parts.push(`workspaces=${scope.workspaceIds.join(",")}`);
  if (scope.userIds?.length) parts.push(`users=${scope.userIds.join(",")}`);
  return parts.join(" | ");
}

export type RunEndCoverageRow = {
  type: string;
  surface: ChatSurface;
  runId: string | null;
  recordedAt: Date;
  conversationId?: string | null;
  projectId?: string | null;
};

export type RunEndCoverageSurface = {
  total: number;
  withRunId: number;
  missingRunId: number;
  coverage: number | null;
  missingSamples: Array<{
    recordedAt: string;
    conversationId: string | null;
    projectId: string | null;
  }>;
};

export type RunEndCoverageSummary = {
  bySurface: Record<ChatSurface, RunEndCoverageSurface>;
};

function createRunEndSurfaceSummary(): RunEndCoverageSurface {
  return {
    total: 0,
    withRunId: 0,
    missingRunId: 0,
    coverage: null,
    missingSamples: [],
  };
}

export function summarizeRunEndRunIdCoverage(
  rows: RunEndCoverageRow[],
): RunEndCoverageSummary {
  const bySurface: Record<ChatSurface, RunEndCoverageSurface> = {
    ai: createRunEndSurfaceSummary(),
    project: createRunEndSurfaceSummary(),
  };

  for (const row of rows) {
    if (!SURFACES.includes(row.surface)) continue;
    if (row.type !== "run_end_observed") continue;

    const surfaceSummary = bySurface[row.surface];
    surfaceSummary.total += 1;
    if (row.runId && row.runId.trim().length > 0) {
      surfaceSummary.withRunId += 1;
      continue;
    }

    surfaceSummary.missingRunId += 1;
    if (surfaceSummary.missingSamples.length < MAX_SAMPLE_ROWS_PER_SURFACE) {
      surfaceSummary.missingSamples.push({
        recordedAt: row.recordedAt.toISOString(),
        conversationId: row.conversationId ?? null,
        projectId: row.projectId ?? null,
      });
    }
  }

  for (const surface of SURFACES) {
    const summary = bySurface[surface];
    summary.coverage = summary.total > 0 ? summary.withRunId / summary.total : null;
  }

  return { bySurface };
}

export type RunEndCoverageGateConfig = {
  requireRunEndPerSurface: boolean;
  minRunIdCoveragePerSurface: number;
};

export function evaluateRunEndCoverageGates(
  summary: RunEndCoverageSummary,
  config: RunEndCoverageGateConfig,
): string[] {
  const failures: string[] = [];

  for (const surface of SURFACES) {
    const surfaceSummary = summary.bySurface[surface];

    if (config.requireRunEndPerSurface && surfaceSummary.total === 0) {
      failures.push(`${surface} run_end_observed sample is empty (requireRunEndPerSurface=1).`);
      continue;
    }

    if (config.minRunIdCoveragePerSurface > 0) {
      if (surfaceSummary.coverage === null) {
        failures.push(
          `${surface} runId coverage unavailable: no run_end_observed rows (required >= ${config.minRunIdCoveragePerSurface}).`,
        );
        continue;
      }

      if (surfaceSummary.coverage < config.minRunIdCoveragePerSurface) {
        failures.push(
          `${surface} runId coverage below threshold: ${surfaceSummary.coverage} < ${config.minRunIdCoveragePerSurface}.`,
        );
      }
    }
  }

  return failures;
}

export function resolveBurnInWindow(params: {
  since: Date;
  until?: Date;
  now?: Date;
  allowShortWindow?: boolean;
}): { since: Date; until: Date } {
  const now = params.now ?? new Date();
  const until = params.until ?? now;
  if (params.since > until) {
    throw new Error(
      `--since must be <= --until. received since=${params.since.toISOString()} until=${until.toISOString()}`,
    );
  }
  const durationMs = until.getTime() - params.since.getTime();
  if (durationMs < MIN_BURN_IN_WINDOW_MS && !params.allowShortWindow) {
    throw new Error(
      "Burn-in window must cover at least 7 days. Use --allowShortWindow=1 only for local dry runs.",
    );
  }
  return { since: params.since, until };
}
