/**
 * Validate U1.6 burn-in gate from ChatUnificationMetric telemetry.
 *
 * Usage:
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=2026-03-01T00:00:00.000Z
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=... --until=...
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=... --report=docs/reports/u1-6-burn-in.md
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=... --until=... --allowShortWindow=1
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=... --workspaceIds=ws-1,ws-2 --userIds=user-1
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=... --requireRunEndPerSurface=1 --minRunIdCoveragePerSurface=0.95
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=... --metricVersion=2
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import {
  DEFAULT_BURN_IN_THRESHOLDS,
  evaluateChatUnificationBurnIn,
  formatChatUnificationBurnInReport,
  type BurnInThresholds,
} from "../lib/ai/chat-unification-burn-in";
import {
  buildCohortWhereInput,
  evaluateRunEndCoverageGates,
  formatCohortScope,
  hasCohortScope,
  parseMetricVersionArg,
  parseCsvIdArg,
  parseIsoDateArg,
  resolveBurnInWindow,
  summarizeRunEndRunIdCoverage,
} from "../lib/ai/chat-unification-burn-in-cli";
import type { ChatSurface, ChatUnificationMetricType } from "../types/chat-unification";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "",
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
  log: ["error"],
});

const METRIC_TYPES = [
  "retry_model_continuity",
  "ask_user_context_mismatch",
  "stuck_running_tools_after_run_end",
  "run_end_observed",
] as const satisfies readonly ChatUnificationMetricType[];

const SURFACES = ["ai", "project"] as const satisfies readonly ChatSurface[];

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "P2021") return true;
  if (typeof candidate.message !== "string") return false;
  return candidate.message.includes("does not exist in the current database");
}

function parseIntArg(name: string, fallback: number): number {
  const raw = parseArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric value for --${name}: ${raw}`);
  }
  return parsed;
}

function parseFloatArg(name: string, fallback: number): number {
  const raw = parseArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric value for --${name}: ${raw}`);
  }
  return parsed;
}

function parseCoverageConfigFromArgs(): {
  requireScopedCohort: boolean;
  requireRunEndPerSurface: boolean;
  minRunIdCoveragePerSurface: number;
} {
  const minRunIdCoveragePerSurface = parseFloatArg("minRunIdCoveragePerSurface", 0);
  if (minRunIdCoveragePerSurface > 1) {
    throw new Error(
      `Invalid numeric value for --minRunIdCoveragePerSurface: ${minRunIdCoveragePerSurface} (expected 0..1)`,
    );
  }
  return {
    requireScopedCohort: parseArg("requireScopedCohort") === "1",
    requireRunEndPerSurface: parseArg("requireRunEndPerSurface") === "1",
    minRunIdCoveragePerSurface,
  };
}

function formatRunIdCoverageReport(
  runIdCoverage: ReturnType<typeof summarizeRunEndRunIdCoverage>,
): string {
  const lines: string[] = ["Run-end runId coverage by surface:"];
  for (const surface of SURFACES) {
    const coverage = runIdCoverage.bySurface[surface];
    lines.push(
      `- ${surface}: withRunId=${coverage.withRunId}/${coverage.total} coverage=${coverage.coverage ?? "n/a"} missing=${coverage.missingRunId}`,
    );
    if (coverage.missingSamples.length > 0) {
      lines.push(`  missing samples (${coverage.missingSamples.length} shown):`);
      for (const sample of coverage.missingSamples) {
        lines.push(
          `  - recordedAt=${sample.recordedAt} conversationId=${sample.conversationId ?? "null"} projectId=${sample.projectId ?? "null"}`,
        );
      }
    }
  }
  return lines.join("\n");
}

function parseThresholdsFromArgs(): BurnInThresholds {
  return {
    minCompletedRuns: parseIntArg("minCompletedRuns", DEFAULT_BURN_IN_THRESHOLDS.minCompletedRuns),
    minCompletedRunsPerSurface: parseIntArg(
      "minCompletedRunsPerSurface",
      DEFAULT_BURN_IN_THRESHOLDS.minCompletedRunsPerSurface,
    ),
    minRetrySamplesOverall: parseIntArg(
      "minRetrySamplesOverall",
      DEFAULT_BURN_IN_THRESHOLDS.minRetrySamplesOverall,
    ),
    minRetrySamplesPerSurface: parseIntArg(
      "minRetrySamplesPerSurface",
      DEFAULT_BURN_IN_THRESHOLDS.minRetrySamplesPerSurface,
    ),
    minRetryMatchedOverall: parseIntArg(
      "minRetryMatchedOverall",
      DEFAULT_BURN_IN_THRESHOLDS.minRetryMatchedOverall,
    ),
    minRetryMatchedPerSurface: parseIntArg(
      "minRetryMatchedPerSurface",
      DEFAULT_BURN_IN_THRESHOLDS.minRetryMatchedPerSurface,
    ),
    minAskUserSamplesOverall: parseIntArg(
      "minAskUserSamplesOverall",
      DEFAULT_BURN_IN_THRESHOLDS.minAskUserSamplesOverall,
    ),
    minAskUserSamplesPerSurface: parseIntArg(
      "minAskUserSamplesPerSurface",
      DEFAULT_BURN_IN_THRESHOLDS.minAskUserSamplesPerSurface,
    ),
    retryContinuityRateMin: parseFloatArg(
      "retryContinuityRateMin",
      DEFAULT_BURN_IN_THRESHOLDS.retryContinuityRateMin,
    ),
    retryMatchRateMin: parseFloatArg(
      "retryMatchRateMin",
      DEFAULT_BURN_IN_THRESHOLDS.retryMatchRateMin,
    ),
    retryMatchRateMinPerSurface: parseFloatArg(
      "retryMatchRateMinPerSurface",
      DEFAULT_BURN_IN_THRESHOLDS.retryMatchRateMinPerSurface,
    ),
    askUserMismatchRateMax: parseFloatArg(
      "askUserMismatchRateMax",
      DEFAULT_BURN_IN_THRESHOLDS.askUserMismatchRateMax,
    ),
    stuckRunningViolationRateMax: parseFloatArg(
      "stuckRunningViolationRateMax",
      DEFAULT_BURN_IN_THRESHOLDS.stuckRunningViolationRateMax,
    ),
    retryJoinWindowMinutes: parseIntArg(
      "retryJoinWindowMinutes",
      DEFAULT_BURN_IN_THRESHOLDS.retryJoinWindowMinutes,
    ),
  };
}

async function maybeWriteReport(path: string | undefined, content: string): Promise<void> {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${content}\n`, "utf8");
}

async function main() {
  const since = parseIsoDateArg("since", parseArg("since"), true) as Date;
  const untilRaw = parseIsoDateArg("until", parseArg("until"), false);
  const allowShortWindow = parseArg("allowShortWindow") === "1";
  const window = resolveBurnInWindow({
    since,
    until: untilRaw,
    allowShortWindow,
  });

  const thresholds = parseThresholdsFromArgs();
  const coverageConfig = parseCoverageConfigFromArgs();
  const cohortScope = {
    workspaceIds: parseCsvIdArg("workspaceIds", parseArg("workspaceIds")),
    userIds: parseCsvIdArg("userIds", parseArg("userIds")),
  };
  const metricVersion = parseMetricVersionArg(parseArg("metricVersion"));
  const allowMixedVersions = parseArg("allowMixedVersions") === "1";
  if (coverageConfig.requireScopedCohort && !hasCohortScope(cohortScope)) {
    throw new Error(
      "Cohort scope is required. Pass --workspaceIds and/or --userIds when --requireScopedCohort=1.",
    );
  }
  const reportPath = parseArg("report");
  const outputJson = parseArg("json") === "1";

  let metrics: Array<{
    version: number;
    type: ChatUnificationMetricType;
    surface: ChatSurface;
    userId: string | null;
    workspaceId: string | null;
    runId: string | null;
    payload: unknown;
    recordedAt: Date;
  }>;

  try {
    const mixedVersionRows = await prisma.chatUnificationMetric.findMany({
      where: {
        recordedAt: {
          gte: window.since,
          lte: window.until,
        },
        type: {
          in: [...METRIC_TYPES],
        },
        surface: {
          in: [...SURFACES],
        },
        ...buildCohortWhereInput(cohortScope),
      },
      select: {
        version: true,
      },
      distinct: ["version"],
    });

    if (!allowMixedVersions) {
      const observedVersions = mixedVersionRows.map((row) => row.version).sort((a, b) => a - b);
      if (observedVersions.length > 1) {
        throw new Error(
          `Mixed metric versions detected in window: [${observedVersions.join(", ")}]. Re-run with --allowMixedVersions=1 for diagnostics only.`,
        );
      }
    }

    metrics = await prisma.chatUnificationMetric.findMany({
      where: {
        recordedAt: {
          gte: window.since,
          lte: window.until,
        },
        type: {
          in: [...METRIC_TYPES],
        },
        surface: {
          in: [...SURFACES],
        },
        version: metricVersion,
        ...buildCohortWhereInput(cohortScope),
      },
      select: {
        version: true,
        type: true,
        surface: true,
        userId: true,
        workspaceId: true,
        runId: true,
        conversationId: true,
        projectId: true,
        payload: true,
        recordedAt: true,
      },
    }) as Array<{
      version: number;
      type: ChatUnificationMetricType;
      surface: ChatSurface;
      userId: string | null;
      workspaceId: string | null;
      runId: string | null;
      conversationId: string | null;
      projectId: string | null;
      payload: unknown;
      recordedAt: Date;
    }>;
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        "ChatUnificationMetric table is missing. Apply migrations first (`cd next-app && npx prisma migrate dev` or deploy migrations in your target environment).",
      );
    }
    throw error;
  }

  const baseEvaluation = evaluateChatUnificationBurnIn(metrics, thresholds);
  const runIdCoverage = summarizeRunEndRunIdCoverage(metrics);
  const runIdCoverageFailures = evaluateRunEndCoverageGates(runIdCoverage, {
    requireRunEndPerSurface: coverageConfig.requireRunEndPerSurface,
    minRunIdCoveragePerSurface: coverageConfig.minRunIdCoveragePerSurface,
  });
  const evaluation = {
    ...baseEvaluation,
    failures: [...baseEvaluation.failures, ...runIdCoverageFailures],
    passed: baseEvaluation.passed && runIdCoverageFailures.length === 0,
  };

  const header = [
    `Window since: ${window.since.toISOString()}`,
    `Window until: ${window.until.toISOString()}`,
    `Short-window override: ${allowShortWindow ? "enabled" : "disabled"}`,
    `Mixed-version override: ${allowMixedVersions ? "enabled" : "disabled"}`,
    `Cohort scope: ${formatCohortScope(cohortScope)}`,
    `Rows analyzed: ${metrics.length}`,
    `Metric version: ${metricVersion}`,
  ].join("\n");
  const body = formatChatUnificationBurnInReport(evaluation);
  const coverageSection = formatRunIdCoverageReport(runIdCoverage);
  const output = `${header}\n${body}\n${coverageSection}`;

  if (outputJson) {
    console.log(
      JSON.stringify(
        {
          since: since.toISOString(),
          until: window.until.toISOString(),
          allowShortWindow,
          rowsAnalyzed: metrics.length,
          metricVersion,
          cohortScope,
          runIdCoverage,
          evaluation,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(output);
  }

  await maybeWriteReport(reportPath, output);

  if (!evaluation.passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Burn-in validation failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  });
