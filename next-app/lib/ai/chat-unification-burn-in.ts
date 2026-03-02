import type { ChatSurface, ChatUnificationMetricType } from "@/types/chat-unification";

const SURFACES: ChatSurface[] = ["ai", "project"];

export type ChatUnificationBurnInMetricRow = {
  type: ChatUnificationMetricType;
  surface: ChatSurface;
  runId: string | null;
  payload: unknown;
  recordedAt: Date;
};

export type BurnInThresholds = {
  minCompletedRuns: number;
  minCompletedRunsPerSurface: number;
  minRetrySamplesOverall: number;
  minRetrySamplesPerSurface: number;
  minAskUserSamplesOverall: number;
  minAskUserSamplesPerSurface: number;
  retryContinuityRateMin: number;
  askUserMismatchRateMax: number;
  stuckRunningViolationRateMax: number;
};

export type SurfaceMetricSummary = {
  total: number;
  preserved?: number;
  mismatches?: number;
  violations?: number;
};

export type BurnInMetricSummary = {
  total: number;
  rate: number | null;
  bySurface: Record<ChatSurface, SurfaceMetricSummary>;
};

export type ChatUnificationBurnInReport = {
  passed: boolean;
  failures: string[];
  thresholds: BurnInThresholds;
  sample: {
    completedRuns: {
      total: number;
      bySurface: Record<ChatSurface, number>;
    };
  };
  retryModelContinuity: BurnInMetricSummary & {
    preserved: number;
  };
  askUserContextMismatch: BurnInMetricSummary & {
    mismatches: number;
  };
  stuckRunningToolsAfterRunEnd: BurnInMetricSummary & {
    violations: number;
  };
};

export const DEFAULT_BURN_IN_THRESHOLDS: BurnInThresholds = {
  minCompletedRuns: 200,
  minCompletedRunsPerSurface: 50,
  minRetrySamplesOverall: 30,
  minRetrySamplesPerSurface: 10,
  minAskUserSamplesOverall: 30,
  minAskUserSamplesPerSurface: 10,
  retryContinuityRateMin: 0.99,
  askUserMismatchRateMax: 0,
  stuckRunningViolationRateMax: 0,
};

function computeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function createSurfaceTotals(): Record<ChatSurface, SurfaceMetricSummary> {
  return {
    ai: { total: 0 },
    project: { total: 0 },
  };
}

function payloadAsObject(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, unknown>;
}

export function evaluateChatUnificationBurnIn(
  rows: ChatUnificationBurnInMetricRow[],
  thresholds: BurnInThresholds = DEFAULT_BURN_IN_THRESHOLDS,
): ChatUnificationBurnInReport {
  const retryBySurface = createSurfaceTotals();
  const askBySurface = createSurfaceTotals();
  const stuckBySurface = createSurfaceTotals();

  let retryTotal = 0;
  let retryPreserved = 0;
  let askTotal = 0;
  let askMismatches = 0;
  let stuckTotal = 0;
  let stuckViolations = 0;

  const completedRunIds = new Set<string>();
  const completedRunIdsBySurface: Record<ChatSurface, Set<string>> = {
    ai: new Set<string>(),
    project: new Set<string>(),
  };

  for (const row of rows) {
    if (!SURFACES.includes(row.surface)) continue;
    const payload = payloadAsObject(row.payload);

    if (row.type === "retry_model_continuity") {
      retryTotal += 1;
      retryBySurface[row.surface].total += 1;
      const preserved = payload?.preserved === true;
      if (preserved) {
        retryPreserved += 1;
        retryBySurface[row.surface].preserved = (retryBySurface[row.surface].preserved ?? 0) + 1;
      }
      continue;
    }

    if (row.type === "ask_user_context_mismatch") {
      askTotal += 1;
      askBySurface[row.surface].total += 1;
      const mismatch = payload?.mismatch === true;
      if (mismatch) {
        askMismatches += 1;
        askBySurface[row.surface].mismatches = (askBySurface[row.surface].mismatches ?? 0) + 1;
      }
      continue;
    }

    if (row.type === "stuck_running_tools_after_run_end") {
      stuckTotal += 1;
      stuckBySurface[row.surface].total += 1;
      const unresolved = payload?.unresolvedCount;
      const violation = typeof unresolved === "number" && unresolved > 0;
      if (violation) {
        stuckViolations += 1;
        stuckBySurface[row.surface].violations = (stuckBySurface[row.surface].violations ?? 0) + 1;
      }
      continue;
    }

    if (row.type === "run_end_observed") {
      if (!row.runId) continue;
      if (payload?.runStatus === "completed") {
        completedRunIds.add(row.runId);
        completedRunIdsBySurface[row.surface].add(row.runId);
      }
    }
  }

  const retryRate = computeRate(retryPreserved, retryTotal);
  const askMismatchRate = computeRate(askMismatches, askTotal);
  const stuckViolationRate = computeRate(stuckViolations, stuckTotal);

  const failures: string[] = [];
  const completedRunsTotal = completedRunIds.size;
  const completedRunsBySurface = {
    ai: completedRunIdsBySurface.ai.size,
    project: completedRunIdsBySurface.project.size,
  };

  if (completedRunsTotal < thresholds.minCompletedRuns) {
    failures.push(
      `Completed runs below threshold: ${completedRunsTotal} < ${thresholds.minCompletedRuns}.`,
    );
  }

  for (const surface of SURFACES) {
    if (completedRunsBySurface[surface] < thresholds.minCompletedRunsPerSurface) {
      failures.push(
        `${surface} completed runs below threshold: ${completedRunsBySurface[surface]} < ${thresholds.minCompletedRunsPerSurface}.`,
      );
    }
  }

  if (retryTotal < thresholds.minRetrySamplesOverall) {
    failures.push(
      `Retry continuity denominator too small: ${retryTotal} < ${thresholds.minRetrySamplesOverall}.`,
    );
  }
  for (const surface of SURFACES) {
    const surfaceTotal = retryBySurface[surface].total;
    if (surfaceTotal < thresholds.minRetrySamplesPerSurface) {
      failures.push(
        `${surface} retry denominator too small: ${surfaceTotal} < ${thresholds.minRetrySamplesPerSurface}.`,
      );
    }
  }

  if (askTotal < thresholds.minAskUserSamplesOverall) {
    failures.push(
      `Ask-user denominator too small: ${askTotal} < ${thresholds.minAskUserSamplesOverall}.`,
    );
  }
  for (const surface of SURFACES) {
    const surfaceTotal = askBySurface[surface].total;
    if (surfaceTotal < thresholds.minAskUserSamplesPerSurface) {
      failures.push(
        `${surface} ask-user denominator too small: ${surfaceTotal} < ${thresholds.minAskUserSamplesPerSurface}.`,
      );
    }
  }

  if (retryRate === null || retryRate < thresholds.retryContinuityRateMin) {
    failures.push(
      `Retry continuity below threshold: ${retryRate ?? "n/a"} < ${thresholds.retryContinuityRateMin}.`,
    );
  }

  if (askMismatchRate === null || askMismatchRate > thresholds.askUserMismatchRateMax) {
    failures.push(
      `Ask-user mismatch above threshold: ${askMismatchRate ?? "n/a"} > ${thresholds.askUserMismatchRateMax}.`,
    );
  }

  if (stuckViolationRate === null || stuckViolationRate > thresholds.stuckRunningViolationRateMax) {
    failures.push(
      `Stuck-running violations above threshold: ${stuckViolationRate ?? "n/a"} > ${thresholds.stuckRunningViolationRateMax}.`,
    );
  }

  return {
    passed: failures.length === 0,
    failures,
    thresholds,
    sample: {
      completedRuns: {
        total: completedRunsTotal,
        bySurface: completedRunsBySurface,
      },
    },
    retryModelContinuity: {
      total: retryTotal,
      preserved: retryPreserved,
      rate: retryRate,
      bySurface: retryBySurface,
    },
    askUserContextMismatch: {
      total: askTotal,
      mismatches: askMismatches,
      rate: askMismatchRate,
      bySurface: askBySurface,
    },
    stuckRunningToolsAfterRunEnd: {
      total: stuckTotal,
      violations: stuckViolations,
      rate: stuckViolationRate,
      bySurface: stuckBySurface,
    },
  };
}

export function formatChatUnificationBurnInReport(
  report: ChatUnificationBurnInReport,
): string {
  const lines: string[] = [];
  lines.push(`Burn-in pass: ${report.passed ? "YES" : "NO"}`);
  lines.push(`Completed runs: ${report.sample.completedRuns.total}`);
  lines.push(
    `Completed by surface: ai=${report.sample.completedRuns.bySurface.ai}, project=${report.sample.completedRuns.bySurface.project}`,
  );
  lines.push(
    `Retry continuity: ${report.retryModelContinuity.preserved}/${report.retryModelContinuity.total} (${report.retryModelContinuity.rate ?? "n/a"})`,
  );
  lines.push(
    `Ask-user mismatch: ${report.askUserContextMismatch.mismatches}/${report.askUserContextMismatch.total} (${report.askUserContextMismatch.rate ?? "n/a"})`,
  );
  lines.push(
    `Stuck-running violations: ${report.stuckRunningToolsAfterRunEnd.violations}/${report.stuckRunningToolsAfterRunEnd.total} (${report.stuckRunningToolsAfterRunEnd.rate ?? "n/a"})`,
  );
  if (report.failures.length > 0) {
    lines.push("Failures:");
    for (const failure of report.failures) {
      lines.push(`- ${failure}`);
    }
  }
  return lines.join("\n");
}
