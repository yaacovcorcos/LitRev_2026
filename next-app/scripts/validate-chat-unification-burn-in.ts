/**
 * Validate U1.6 burn-in gate from ChatUnificationMetric telemetry.
 *
 * Usage:
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=2026-03-01T00:00:00.000Z
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=... --until=...
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=... --report=docs/reports/u1-6-burn-in.md
 *   npx tsx scripts/validate-chat-unification-burn-in.ts --since=... --until=... --allowShortWindow=1
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
  parseIsoDateArg,
  resolveBurnInWindow,
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
    askUserMismatchRateMax: parseFloatArg(
      "askUserMismatchRateMax",
      DEFAULT_BURN_IN_THRESHOLDS.askUserMismatchRateMax,
    ),
    stuckRunningViolationRateMax: parseFloatArg(
      "stuckRunningViolationRateMax",
      DEFAULT_BURN_IN_THRESHOLDS.stuckRunningViolationRateMax,
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
  const reportPath = parseArg("report");
  const outputJson = parseArg("json") === "1";

  let metrics: Array<{
    type: ChatUnificationMetricType;
    surface: ChatSurface;
    runId: string | null;
    payload: unknown;
    recordedAt: Date;
  }>;

  try {
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
      },
      select: {
        type: true,
        surface: true,
        runId: true,
        payload: true,
        recordedAt: true,
      },
    }) as Array<{
      type: ChatUnificationMetricType;
      surface: ChatSurface;
      runId: string | null;
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

  const evaluation = evaluateChatUnificationBurnIn(metrics, thresholds);

  const header = [
    `Window since: ${window.since.toISOString()}`,
    `Window until: ${window.until.toISOString()}`,
    `Short-window override: ${allowShortWindow ? "enabled" : "disabled"}`,
    `Rows analyzed: ${metrics.length}`,
  ].join("\n");
  const body = formatChatUnificationBurnInReport(evaluation);
  const output = `${header}\n${body}`;

  if (outputJson) {
    console.log(
      JSON.stringify(
        {
          since: since.toISOString(),
          until: window.until.toISOString(),
          allowShortWindow,
          rowsAnalyzed: metrics.length,
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
