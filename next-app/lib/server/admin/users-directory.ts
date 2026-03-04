import "server-only";

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";

export type AdminUsersSortKey =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "email_asc"
  | "email_desc";

export type AdminUsersQuery = {
  page: number;
  pageSize: number;
  search?: string;
  admin?: "all" | "true" | "false";
  sort?: AdminUsersSortKey;
  createdFrom?: Date;
  createdTo?: Date;
  seenFrom?: Date;
  seenTo?: Date;
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  lastSeenAt: Date | null;
  workspaceCount: number;
  projectCount: number;
  inputTokens7d: number;
  outputTokens7d: number;
  totalTokens7d: number;
};

export type AdminUsersResult = {
  rows: AdminUserRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function resolveOrderBy(sort: AdminUsersSortKey): Prisma.UserOrderByWithRelationInput[] {
  switch (sort) {
    case "created_asc":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "name_asc":
      return [{ name: "asc" }, { id: "asc" }];
    case "name_desc":
      return [{ name: "desc" }, { id: "desc" }];
    case "email_asc":
      return [{ email: "asc" }, { id: "asc" }];
    case "email_desc":
      return [{ email: "desc" }, { id: "desc" }];
    case "created_desc":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

export async function listAdminUsers(query: AdminUsersQuery): Promise<AdminUsersResult> {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(10, query.pageSize || 25));
  const sort = query.sort ?? "created_desc";
  const admin = query.admin ?? "all";

  const where: Prisma.UserWhereInput = {};

  if (query.search && query.search.trim().length > 0) {
    const term = query.search.trim();
    where.OR = [
      { email: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
    ];
  }

  if (admin === "true") where.isPlatformAdmin = true;
  if (admin === "false") where.isPlatformAdmin = false;

  if (query.createdFrom || query.createdTo) {
    where.createdAt = {
      ...(query.createdFrom ? { gte: query.createdFrom } : {}),
      ...(query.createdTo ? { lte: query.createdTo } : {}),
    };
  }

  if (query.seenFrom || query.seenTo) {
    where.sessions = {
      some: {
        updatedAt: {
          ...(query.seenFrom ? { gte: query.seenFrom } : {}),
          ...(query.seenTo ? { lte: query.seenTo } : {}),
        },
      },
    };
  }

  const [totalCount, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: resolveOrderBy(sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        emailVerified: true,
        isPlatformAdmin: true,
        sessions: {
          select: { updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            memberships: true,
            projects: true,
          },
        },
      },
    }),
  ]);

  const userIds = users.map((user) => user.id);
  const usageCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const usageByUser =
    userIds.length === 0
      ? []
      : await prisma.aIUsage.groupBy({
          by: ["userId"],
          where: {
            userId: { in: userIds },
            createdAt: { gte: usageCutoff },
          },
          _sum: {
            inputTokens: true,
            outputTokens: true,
          },
        });

  const usageMap = new Map(
    usageByUser
      .filter((entry) => Boolean(entry.userId))
      .map((entry) => [
        entry.userId as string,
        {
          inputTokens7d: entry._sum.inputTokens ?? 0,
          outputTokens7d: entry._sum.outputTokens ?? 0,
        },
      ]),
  );

  const rows: AdminUserRow[] = users.map((user) => {
    const usage = usageMap.get(user.id) ?? { inputTokens7d: 0, outputTokens7d: 0 };
    const totalTokens7d = usage.inputTokens7d + usage.outputTokens7d;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      emailVerified: user.emailVerified,
      isPlatformAdmin: user.isPlatformAdmin,
      lastSeenAt: user.sessions[0]?.updatedAt ?? null,
      workspaceCount: user._count.memberships,
      projectCount: user._count.projects,
      inputTokens7d: usage.inputTokens7d,
      outputTokens7d: usage.outputTokens7d,
      totalTokens7d,
    };
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}
