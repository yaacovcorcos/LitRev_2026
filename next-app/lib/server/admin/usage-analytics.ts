import "server-only";

import { prisma } from "@/lib/server/prisma";

export type AdminUsageWindowDays = 7 | 30 | 90;

export type AdminUsageBreakdownRow = {
  key: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AdminUsageDailyRow = {
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AdminUsageAnalytics = {
  windowDays: AdminUsageWindowDays;
  since: Date;
  totals: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    uniqueUsers: number;
    uniqueWorkspaces: number;
    attributedRequests: number;
    legacyRequests: number;
  };
  bySource: AdminUsageBreakdownRow[];
  byContextPage: AdminUsageBreakdownRow[];
  byModel: AdminUsageBreakdownRow[];
  byDay: AdminUsageDailyRow[];
};

type UsageDailyQueryRow = {
  day: Date | string;
  requests: number | bigint;
  inputTokens: number | bigint | null;
  outputTokens: number | bigint | null;
};

type CountDistinctRow = {
  count: number | bigint;
};

function toNumber(value: number | bigint | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return 0;
}

function toDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function mapBreakdownRow(row: {
  _count: number;
  _sum: { inputTokens: number | null; outputTokens: number | null };
}): Omit<AdminUsageBreakdownRow, "key"> {
  const inputTokens = row._sum.inputTokens ?? 0;
  const outputTokens = row._sum.outputTokens ?? 0;

  return {
    requests: row._count,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export async function getAdminUsageAnalytics({
  windowDays,
}: {
  windowDays: AdminUsageWindowDays;
}): Promise<AdminUsageAnalytics> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [totals, bySourceRaw, byContextRaw, byModelRaw, legacyRequests, usersDistinct, workspacesDistinct, byDayRaw] =
    await Promise.all([
      prisma.aIUsage.aggregate({
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
        },
      }),
      prisma.aIUsage.groupBy({
        by: ["source"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
        },
        orderBy: { _count: { source: "desc" } },
      }),
      prisma.aIUsage.groupBy({
        by: ["contextPage"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
        },
        orderBy: { _count: { contextPage: "desc" } },
      }),
      prisma.aIUsage.groupBy({
        by: ["model"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
        },
        orderBy: { _count: { model: "desc" } },
      }),
      prisma.aIUsage.count({
        where: {
          createdAt: { gte: since },
          OR: [{ source: "legacy_unknown" }, { contextPage: "legacy_unknown" }],
        },
      }),
      prisma.$queryRaw<CountDistinctRow[]>`
        SELECT COUNT(DISTINCT "userId")::bigint AS count
        FROM "AIUsage"
        WHERE "createdAt" >= ${since}
          AND "userId" IS NOT NULL
      `,
      prisma.$queryRaw<CountDistinctRow[]>`
        SELECT COUNT(DISTINCT "workspaceId")::bigint AS count
        FROM "AIUsage"
        WHERE "createdAt" >= ${since}
          AND "workspaceId" IS NOT NULL
      `,
      prisma.$queryRaw<UsageDailyQueryRow[]>`
        SELECT
          DATE_TRUNC('day', "createdAt")::date AS day,
          COUNT(*)::bigint AS requests,
          COALESCE(SUM("inputTokens"), 0)::bigint AS "inputTokens",
          COALESCE(SUM("outputTokens"), 0)::bigint AS "outputTokens"
        FROM "AIUsage"
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);

  const totalRequests = totals._count._all;
  const inputTokens = totals._sum.inputTokens ?? 0;
  const outputTokens = totals._sum.outputTokens ?? 0;

  return {
    windowDays,
    since,
    totals: {
      requests: totalRequests,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      uniqueUsers: toNumber(usersDistinct[0]?.count),
      uniqueWorkspaces: toNumber(workspacesDistinct[0]?.count),
      attributedRequests: totalRequests - legacyRequests,
      legacyRequests,
    },
    bySource: bySourceRaw.map((row) => ({
      key: row.source,
      ...mapBreakdownRow({
        _count: row._count._all,
        _sum: row._sum,
      }),
    })),
    byContextPage: byContextRaw.map((row) => ({
      key: row.contextPage,
      ...mapBreakdownRow({
        _count: row._count._all,
        _sum: row._sum,
      }),
    })),
    byModel: byModelRaw.map((row) => ({
      key: row.model,
      ...mapBreakdownRow({
        _count: row._count._all,
        _sum: row._sum,
      }),
    })),
    byDay: byDayRaw.map((row) => {
      const dayInput = toNumber(row.inputTokens);
      const dayOutput = toNumber(row.outputTokens);
      return {
        day: toDateKey(row.day),
        requests: toNumber(row.requests),
        inputTokens: dayInput,
        outputTokens: dayOutput,
        totalTokens: dayInput + dayOutput,
      };
    }),
  };
}
