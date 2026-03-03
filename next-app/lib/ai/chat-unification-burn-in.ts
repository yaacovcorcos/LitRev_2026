import type {
  ChatSurface,
  ChatUnificationMetricType,
  RetryModelContinuityCompletionPayload,
  RetryModelContinuityIntentPayload,
} from "@/types/chat-unification";

const SURFACES: ChatSurface[] = ["ai", "project"];
const RETRY_MATCH_WINDOW_MS = 30 * 60 * 1000;
const RETRY_TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled", "paused"]);

type RetryJoinSample = {
  requestKey: string;
  expectedModel: string | null;
  actualModel: string | null;
  preserved: boolean;
  surface: ChatSurface;
  userId: string | null;
  workspaceId: string | null;
};

type RetryJoinBucket = {
  intents: Array<{ payload: RetryModelContinuityIntentPayload; recordedAt: Date }>;
  completions: Array<{ payload: RetryModelContinuityCompletionPayload; recordedAt: Date }>;
  surface: ChatSurface;
  userId: string | null;
  workspaceId: string | null;
};

export type ChatUnificationBurnInMetricRow = {
  type: ChatUnificationMetricType;
  version: number;
  surface: ChatSurface;
  runId: string | null;
  userId: string | null;
  workspaceId: string | null;
  payload: unknown;
  recordedAt: Date;
};

export type BurnInThresholds = {
  minCompletedRuns: number;
  minCompletedRunsPerSurface: number;
  minRetrySamplesOverall: number;
  minRetrySamplesPerSurface: number;
  minRetryMatchRateOverall: number;
  minRetryMatchRatePerSurface: number;
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
  unmatchedIntents?: number;
  unmatchedCompletions?: number;
  matchRate?: number | null;
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
    retryJoin: {
      intentTotal: number;
      completionTotal: number;
      matchedPairs: number;
      unmatchedRetryIntents: number;
      unmatchedRunCompletions: number;
      matchRateOverall: number | null;
      bySurface: Record<
        ChatSurface,
        {
          intentTotal: number;
          completionTotal: number;
          matchedPairs: number;
          unmatchedRetryIntents: number;
          unmatchedRunCompletions: number;
          matchRate: number | null;
        }
      >;
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
  minRetryMatchRateOverall: 0.95,
  minRetryMatchRatePerSurface: 0.9,
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

function asRetryIntentPayload(payload: unknown): RetryModelContinuityIntentPayload | null {
  const objectPayload = payloadAsObject(payload);
  if (!objectPayload) return null;
  if (objectPayload.source !== "retry_action") return null;
  if (typeof objectPayload.requestKey !== "string") return null;
  const expectedModel =
    typeof objectPayload.expectedModel === "string" || objectPayload.expectedModel === null
      ? (objectPayload.expectedModel as string | null)
      : null;
  return {
    requestKey: objectPayload.requestKey,
    expectedModel,
    source: "retry_action",
  };
}

function asRetryCompletionPayload(payload: unknown): RetryModelContinuityCompletionPayload | null {
  const objectPayload = payloadAsObject(payload);
  if (!objectPayload) return null;
  if (objectPayload.source !== "run_completion") return null;
  if (typeof objectPayload.requestKey !== "string") return null;
  const actualModel =
    typeof objectPayload.actualModel === "string" || objectPayload.actualModel === null
      ? (objectPayload.actualModel as string | null)
      : null;
  const runId =
    typeof objectPayload.runId === "string" || objectPayload.runId === null
      ? (objectPayload.runId as string | null)
      : null;
  const runStatus =
    typeof objectPayload.runStatus === "string" || objectPayload.runStatus === null
      ? (objectPayload.runStatus as string | null)
      : null;
  return {
    requestKey: objectPayload.requestKey,
    actualModel,
    runId,
    runStatus,
    source: "run_completion",
  };
}

function joinKey(row: ChatUnificationBurnInMetricRow, requestKey: string): string {
  return [
    requestKey,
    row.userId ?? "",
    row.workspaceId ?? "",
    row.surface,
  ].join("|");
}

function pairRetrySamples(bucket: RetryJoinBucket): {
  matches: RetryJoinSample[];
  unmatchedIntents: number;
  unmatchedCompletions: number;
} {
  const intents = [...bucket.intents].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const completions = [...bucket.completions].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  const matches: RetryJoinSample[] = [];
  let unmatchedIntents = 0;
  let unmatchedCompletions = 0;
  let i = 0;
  let j = 0;

  while (i < intents.length && j < completions.length) {
    const intent = intents[i];
    const completion = completions[j];
    const deltaMs = completion.recordedAt.getTime() - intent.recordedAt.getTime();

    if (Math.abs(deltaMs) <= RETRY_MATCH_WINDOW_MS) {
      const expected = intent.payload.expectedModel;
      const actual = completion.payload.actualModel;
      matches.push({
        requestKey: intent.payload.requestKey,
        expectedModel: expected,
        actualModel: actual,
        preserved: expected !== null && actual !== null && expected === actual,
        surface: bucket.surface,
        userId: bucket.userId,
        workspaceId: bucket.workspaceId,
      });
      i += 1;
      j += 1;
      continue;
    }

    if (deltaMs < -RETRY_MATCH_WINDOW_MS) {
      unmatchedCompletions += 1;
      j += 1;
      continue;
    }

    unmatchedIntents += 1;
    i += 1;
  }

  unmatchedIntents += intents.length - i;
  unmatchedCompletions += completions.length - j;

  return {
    matches,
    unmatchedIntents,
    unmatchedCompletions,
  };
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

  const retryJoinBuckets = new Map<string, RetryJoinBucket>();
  const retryIntentCountsBySurface: Record<ChatSurface, number> = { ai: 0, project: 0 };
  const retryCompletionCountsBySurface: Record<ChatSurface, number> = { ai: 0, project: 0 };
  let retryIntentTotal = 0;
  let retryCompletionTotal = 0;
  let hasRetryV1 = false;
  let hasRetryV2 = false;

  for (const row of rows) {
    if (!SURFACES.includes(row.surface)) continue;
    const payload = payloadAsObject(row.payload);

    if (row.type === "retry_model_continuity") {
      if (row.version === 1) hasRetryV1 = true;
      if (row.version >= 2) hasRetryV2 = true;

      if (row.version >= 2) {
        const intent = asRetryIntentPayload(row.payload);
        if (intent) {
          retryIntentTotal += 1;
          retryIntentCountsBySurface[row.surface] += 1;
          const key = joinKey(row, intent.requestKey);
          const bucket = retryJoinBuckets.get(key) ?? {
            intents: [],
            completions: [],
            surface: row.surface,
            userId: row.userId,
            workspaceId: row.workspaceId,
          };
          bucket.intents.push({ payload: intent, recordedAt: row.recordedAt });
          retryJoinBuckets.set(key, bucket);
          continue;
        }

        const completion = asRetryCompletionPayload(row.payload);
        if (completion && RETRY_TERMINAL_RUN_STATUSES.has(completion.runStatus ?? "")) {
          retryCompletionTotal += 1;
          retryCompletionCountsBySurface[row.surface] += 1;
          const key = joinKey(row, completion.requestKey);
          const bucket = retryJoinBuckets.get(key) ?? {
            intents: [],
            completions: [],
            surface: row.surface,
            userId: row.userId,
            workspaceId: row.workspaceId,
          };
          bucket.completions.push({ payload: completion, recordedAt: row.recordedAt });
          retryJoinBuckets.set(key, bucket);
        }
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

  const retryJoinBySurface = {
    ai: { matchedPairs: 0, unmatchedRetryIntents: 0, unmatchedRunCompletions: 0 },
    project: { matchedPairs: 0, unmatchedRetryIntents: 0, unmatchedRunCompletions: 0 },
  };

  for (const bucket of retryJoinBuckets.values()) {
    const paired = pairRetrySamples(bucket);
    for (const sample of paired.matches) {
      retryTotal += 1;
      retryBySurface[sample.surface].total += 1;
      if (sample.preserved) {
        retryPreserved += 1;
        retryBySurface[sample.surface].preserved = (retryBySurface[sample.surface].preserved ?? 0) + 1;
      }
      retryJoinBySurface[sample.surface].matchedPairs += 1;
    }
    retryJoinBySurface[bucket.surface].unmatchedRetryIntents += paired.unmatchedIntents;
    retryJoinBySurface[bucket.surface].unmatchedRunCompletions += paired.unmatchedCompletions;
  }

  const unmatchedRetryIntents =
    retryJoinBySurface.ai.unmatchedRetryIntents + retryJoinBySurface.project.unmatchedRetryIntents;
  const unmatchedRunCompletions =
    retryJoinBySurface.ai.unmatchedRunCompletions + retryJoinBySurface.project.unmatchedRunCompletions;

  const retryMatchRateOverall = computeRate(retryTotal, retryIntentTotal);
  const retryMatchRateBySurface = {
    ai: computeRate(retryJoinBySurface.ai.matchedPairs, retryIntentCountsBySurface.ai),
    project: computeRate(retryJoinBySurface.project.matchedPairs, retryIntentCountsBySurface.project),
  };

  retryBySurface.ai.unmatchedIntents = retryJoinBySurface.ai.unmatchedRetryIntents;
  retryBySurface.project.unmatchedIntents = retryJoinBySurface.project.unmatchedRetryIntents;
  retryBySurface.ai.unmatchedCompletions = retryJoinBySurface.ai.unmatchedRunCompletions;
  retryBySurface.project.unmatchedCompletions = retryJoinBySurface.project.unmatchedRunCompletions;
  retryBySurface.ai.matchRate = retryMatchRateBySurface.ai;
  retryBySurface.project.matchRate = retryMatchRateBySurface.project;

  const retryRate = computeRate(retryPreserved, retryTotal);
  const askMismatchRate = computeRate(askMismatches, askTotal);
  const stuckViolationRate = computeRate(stuckViolations, stuckTotal);

  const failures: string[] = [];
  const completedRunsTotal = completedRunIds.size;
  const completedRunsBySurface = {
    ai: completedRunIdsBySurface.ai.size,
    project: completedRunIdsBySurface.project.size,
  };

  if (hasRetryV1 && hasRetryV2) {
    failures.push("Mixed retry_model_continuity metric versions detected (v1 + v2). Use a pure v2 measurement window.");
  }
  if (hasRetryV1 && !hasRetryV2) {
    failures.push("Legacy retry_model_continuity metric version (v1) detected without v2 rows. U1.6 continuity requires v2 server-joined telemetry.");
  }

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
      `Retry continuity matched denominator too small: ${retryTotal} < ${thresholds.minRetrySamplesOverall}.`,
    );
  }
  for (const surface of SURFACES) {
    const surfaceTotal = retryBySurface[surface].total;
    if (surfaceTotal < thresholds.minRetrySamplesPerSurface) {
      failures.push(
        `${surface} retry matched denominator too small: ${surfaceTotal} < ${thresholds.minRetrySamplesPerSurface}.`,
      );
    }
  }

  if (retryMatchRateOverall === null || retryMatchRateOverall < thresholds.minRetryMatchRateOverall) {
    failures.push(
      `Retry join match-rate below threshold: ${retryMatchRateOverall ?? "n/a"} < ${thresholds.minRetryMatchRateOverall}.`,
    );
  }

  for (const surface of SURFACES) {
    const surfaceMatchRate = retryMatchRateBySurface[surface];
    if (surfaceMatchRate === null || surfaceMatchRate < thresholds.minRetryMatchRatePerSurface) {
      failures.push(
        `${surface} retry join match-rate below threshold: ${surfaceMatchRate ?? "n/a"} < ${thresholds.minRetryMatchRatePerSurface}.`,
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
      retryJoin: {
        intentTotal: retryIntentTotal,
        completionTotal: retryCompletionTotal,
        matchedPairs: retryTotal,
        unmatchedRetryIntents,
        unmatchedRunCompletions,
        matchRateOverall: retryMatchRateOverall,
        bySurface: {
          ai: {
            intentTotal: retryIntentCountsBySurface.ai,
            completionTotal: retryCompletionCountsBySurface.ai,
            matchedPairs: retryJoinBySurface.ai.matchedPairs,
            unmatchedRetryIntents: retryJoinBySurface.ai.unmatchedRetryIntents,
            unmatchedRunCompletions: retryJoinBySurface.ai.unmatchedRunCompletions,
            matchRate: retryMatchRateBySurface.ai,
          },
          project: {
            intentTotal: retryIntentCountsBySurface.project,
            completionTotal: retryCompletionCountsBySurface.project,
            matchedPairs: retryJoinBySurface.project.matchedPairs,
            unmatchedRetryIntents: retryJoinBySurface.project.unmatchedRetryIntents,
            unmatchedRunCompletions: retryJoinBySurface.project.unmatchedRunCompletions,
            matchRate: retryMatchRateBySurface.project,
          },
        },
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
    `Retry join: intents=${report.sample.retryJoin.intentTotal}, completions=${report.sample.retryJoin.completionTotal}, matched=${report.sample.retryJoin.matchedPairs}, unmatchedIntents=${report.sample.retryJoin.unmatchedRetryIntents}, unmatchedCompletions=${report.sample.retryJoin.unmatchedRunCompletions}, matchRate=${report.sample.retryJoin.matchRateOverall ?? "n/a"}`,
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
