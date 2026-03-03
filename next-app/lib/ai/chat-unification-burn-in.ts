import type { ChatSurface, ChatUnificationMetricType } from "@/types/chat-unification";

const SURFACES: ChatSurface[] = ["ai", "project"];

export type ChatUnificationBurnInMetricRow = {
  version: number;
  type: ChatUnificationMetricType;
  surface: ChatSurface;
  userId: string | null;
  workspaceId: string | null;
  runId: string | null;
  payload: unknown;
  recordedAt: Date;
};

export type BurnInThresholds = {
  minCompletedRuns: number;
  minCompletedRunsPerSurface: number;
  minRetrySamplesOverall: number;
  minRetrySamplesPerSurface: number;
  minRetryMatchedOverall: number;
  minRetryMatchedPerSurface: number;
  minRetryEligibleOverall: number;
  minRetryEligiblePerSurface: number;
  minAskUserSamplesOverall: number;
  minAskUserSamplesPerSurface: number;
  retryContinuityRateMin: number;
  retryMatchRateMin: number;
  retryMatchRateMinPerSurface: number;
  askUserMismatchRateMax: number;
  stuckRunningViolationRateMax: number;
  retryJoinWindowMinutes: number;
};

export type SurfaceMetricSummary = {
  total: number;
  preserved?: number;
  matched?: number;
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
    matched: number;
    eligible: number;
    matchRate: number | null;
    unmatchedIntents: number;
    excludedByRunStatus: Record<string, number>;
  };
  askUserContextMismatch: BurnInMetricSummary & {
    mismatches: number;
  };
  stuckRunningToolsAfterRunEnd: BurnInMetricSummary & {
    violations: number;
    preClearViolations: number;
    postClearViolations: number;
    legacyFallbackViolations: number;
  };
};

export const DEFAULT_BURN_IN_THRESHOLDS: BurnInThresholds = {
  minCompletedRuns: 200,
  minCompletedRunsPerSurface: 50,
  minRetrySamplesOverall: 30,
  minRetrySamplesPerSurface: 10,
  minRetryMatchedOverall: 30,
  minRetryMatchedPerSurface: 10,
  minRetryEligibleOverall: 30,
  minRetryEligiblePerSurface: 10,
  minAskUserSamplesOverall: 30,
  minAskUserSamplesPerSurface: 10,
  retryContinuityRateMin: 0.99,
  retryMatchRateMin: 0.95,
  retryMatchRateMinPerSurface: 0.9,
  askUserMismatchRateMax: 0,
  stuckRunningViolationRateMax: 0,
  retryJoinWindowMinutes: 30,
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

function payloadRequestKey(payload: unknown): string | null {
  const value = payloadAsObject(payload)?.requestKey;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadRunStatus(payload: unknown): string | null {
  const value = payloadAsObject(payload)?.runStatus;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadActualModel(payload: unknown): string | null {
  const value = payloadAsObject(payload)?.actualModel;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadExpectedModel(payload: unknown): string | null {
  const value = payloadAsObject(payload)?.expectedModel;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function retryJoinKey(row: ChatUnificationBurnInMetricRow, requestKey: string): string {
  return [requestKey, row.userId ?? "null", row.workspaceId ?? "null", row.surface].join("|");
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
  let retryMatched = 0;
  let retryEligible = 0;
  let askTotal = 0;
  let askMismatches = 0;
  let stuckTotal = 0;
  let stuckViolations = 0;
  let stuckPreClearViolations = 0;
  let stuckPostClearViolations = 0;
  let stuckLegacyFallbackViolations = 0;

  const completedRunIds = new Set<string>();
  const completedRunIdsBySurface: Record<ChatSurface, Set<string>> = {
    ai: new Set<string>(),
    project: new Set<string>(),
  };
  const joinWindowMs = thresholds.retryJoinWindowMinutes * 60 * 1000;
  const excludedByRunStatus: Record<string, number> = {};
  const completionRowsByJoinKey = new Map<string, ChatUnificationBurnInMetricRow[]>();
  const retryIntentRows: ChatUnificationBurnInMetricRow[] = [];

  for (const row of rows) {
    if (!SURFACES.includes(row.surface)) continue;
    const payload = payloadAsObject(row.payload);

    if (row.type === "retry_model_continuity") {
      retryTotal += 1;
      retryBySurface[row.surface].total += 1;
      retryIntentRows.push(row);
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
      const unresolvedBeforeClear =
        typeof payload?.unresolvedCountBeforeClear === "number"
          ? payload.unresolvedCountBeforeClear
          : null;
      const unresolvedLegacy =
        typeof payload?.unresolvedCount === "number" ? payload.unresolvedCount : null;
      const unresolvedAfterClear =
        typeof payload?.unresolvedCountAfterClear === "number"
          ? payload.unresolvedCountAfterClear
          : null;
      const unresolvedForGate = unresolvedBeforeClear ?? unresolvedLegacy;
      const violation = typeof unresolvedForGate === "number" && unresolvedForGate > 0;
      if (violation) {
        stuckViolations += 1;
        stuckBySurface[row.surface].violations = (stuckBySurface[row.surface].violations ?? 0) + 1;
      }
      if (typeof unresolvedBeforeClear === "number" && unresolvedBeforeClear > 0) {
        stuckPreClearViolations += 1;
      }
      if (typeof unresolvedAfterClear === "number" && unresolvedAfterClear > 0) {
        stuckPostClearViolations += 1;
      }
      if (
        unresolvedBeforeClear === null &&
        typeof unresolvedLegacy === "number" &&
        unresolvedLegacy > 0
      ) {
        stuckLegacyFallbackViolations += 1;
      }
      continue;
    }

    if (row.type === "run_end_observed") {
      const requestKey = payloadRequestKey(row.payload);
      if (requestKey) {
        const key = retryJoinKey(row, requestKey);
        const list = completionRowsByJoinKey.get(key) ?? [];
        list.push(row);
        completionRowsByJoinKey.set(key, list);
      }
      if (!row.runId) continue;
      if (payloadRunStatus(row.payload) === "completed") {
        completedRunIds.add(row.runId);
        completedRunIdsBySurface[row.surface].add(row.runId);
      }
    }
  }

  const retryMatchedBySurface: Record<ChatSurface, number> = { ai: 0, project: 0 };
  const retryEligibleBySurface: Record<ChatSurface, number> = { ai: 0, project: 0 };
  const retryPreservedBySurface: Record<ChatSurface, number> = { ai: 0, project: 0 };
  const usedCompletionRows = new Set<ChatUnificationBurnInMetricRow>();
  const eligibleRunStatuses = new Set(["completed"]);

  for (const row of retryIntentRows) {
    const requestKey = payloadRequestKey(row.payload);
    if (!requestKey) continue;
    const key = retryJoinKey(row, requestKey);
    const completions = completionRowsByJoinKey.get(key);
    if (!completions || completions.length === 0) continue;

    const candidate = completions.find((completion) => {
      if (usedCompletionRows.has(completion)) return false;
      const deltaMs = completion.recordedAt.getTime() - row.recordedAt.getTime();
      return deltaMs >= 0 && deltaMs <= joinWindowMs;
    });
    if (!candidate) continue;
    usedCompletionRows.add(candidate);
    retryMatched += 1;
    retryMatchedBySurface[row.surface] += 1;

    const runStatus = payloadRunStatus(candidate.payload) ?? "unknown";
    if (!eligibleRunStatuses.has(runStatus)) {
      excludedByRunStatus[runStatus] = (excludedByRunStatus[runStatus] ?? 0) + 1;
      continue;
    }
    retryEligible += 1;
    retryEligibleBySurface[row.surface] += 1;

    const expectedModel = payloadExpectedModel(row.payload);
    const actualModel = payloadActualModel(candidate.payload);
    const preserved = expectedModel !== null && actualModel !== null && expectedModel === actualModel;
    if (preserved) {
      retryPreserved += 1;
      retryPreservedBySurface[row.surface] += 1;
    }
  }

  retryBySurface.ai.preserved = retryPreservedBySurface.ai;
  retryBySurface.project.preserved = retryPreservedBySurface.project;
  retryBySurface.ai.matched = retryMatchedBySurface.ai;
  retryBySurface.project.matched = retryMatchedBySurface.project;

  const retryRate = computeRate(retryPreserved, retryEligible);
  const retryMatchRate = computeRate(retryMatched, retryTotal);
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

  if (retryMatched < thresholds.minRetryMatchedOverall) {
    failures.push(
      `Retry matched sample too small: ${retryMatched} < ${thresholds.minRetryMatchedOverall}.`,
    );
  }

  if (retryEligible < thresholds.minRetryEligibleOverall) {
    failures.push(
      `Retry eligible sample too small: ${retryEligible} < ${thresholds.minRetryEligibleOverall}.`,
    );
  }
  for (const surface of SURFACES) {
    const eligible = retryEligibleBySurface[surface];
    if (eligible < thresholds.minRetryEligiblePerSurface) {
      failures.push(
        `${surface} retry eligible sample too small: ${eligible} < ${thresholds.minRetryEligiblePerSurface}.`,
      );
    }
  }
  for (const surface of SURFACES) {
    const matched = retryMatchedBySurface[surface];
    if (matched < thresholds.minRetryMatchedPerSurface) {
      failures.push(
        `${surface} retry matched sample too small: ${matched} < ${thresholds.minRetryMatchedPerSurface}.`,
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

  if (retryMatchRate === null || retryMatchRate < thresholds.retryMatchRateMin) {
    failures.push(
      `Retry match-rate below threshold: ${retryMatchRate ?? "n/a"} < ${thresholds.retryMatchRateMin}.`,
    );
  }
  for (const surface of SURFACES) {
    const surfaceRate = computeRate(retryMatchedBySurface[surface], retryBySurface[surface].total);
    if (surfaceRate === null || surfaceRate < thresholds.retryMatchRateMinPerSurface) {
      failures.push(
        `${surface} retry match-rate below threshold: ${surfaceRate ?? "n/a"} < ${thresholds.retryMatchRateMinPerSurface}.`,
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
      matched: retryMatched,
      eligible: retryEligible,
      matchRate: retryMatchRate,
      unmatchedIntents: retryTotal - retryMatched,
      excludedByRunStatus,
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
      preClearViolations: stuckPreClearViolations,
      postClearViolations: stuckPostClearViolations,
      legacyFallbackViolations: stuckLegacyFallbackViolations,
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
    `Retry continuity: ${report.retryModelContinuity.preserved}/${report.retryModelContinuity.eligible} (${report.retryModelContinuity.rate ?? "n/a"})`,
  );
  lines.push(
    `Retry match-rate: ${report.retryModelContinuity.matched}/${report.retryModelContinuity.total} (${report.retryModelContinuity.matchRate ?? "n/a"})`,
  );
  lines.push(
    `Retry eligible matched: ${report.retryModelContinuity.eligible}/${report.retryModelContinuity.matched}`,
  );
  lines.push(
    `Retry unmatched intents: ${report.retryModelContinuity.unmatchedIntents}`,
  );
  const excludedStatuses = Object.entries(report.retryModelContinuity.excludedByRunStatus);
  if (excludedStatuses.length > 0) {
    lines.push(
      `Retry excluded statuses: ${excludedStatuses.map(([status, count]) => `${status}=${count}`).join(", ")}`,
    );
  }
  lines.push(
    `Ask-user mismatch: ${report.askUserContextMismatch.mismatches}/${report.askUserContextMismatch.total} (${report.askUserContextMismatch.rate ?? "n/a"})`,
  );
  lines.push(
    `Stuck-running violations (gate=preClear/fallback): ${report.stuckRunningToolsAfterRunEnd.violations}/${report.stuckRunningToolsAfterRunEnd.total} (${report.stuckRunningToolsAfterRunEnd.rate ?? "n/a"})`,
  );
  lines.push(
    `Stuck-running detail: preClear=${report.stuckRunningToolsAfterRunEnd.preClearViolations}, postClear=${report.stuckRunningToolsAfterRunEnd.postClearViolations}, legacyFallback=${report.stuckRunningToolsAfterRunEnd.legacyFallbackViolations}`,
  );
  if (report.failures.length > 0) {
    lines.push("Failures:");
    for (const failure of report.failures) {
      lines.push(`- ${failure}`);
    }
  }
  return lines.join("\n");
}
