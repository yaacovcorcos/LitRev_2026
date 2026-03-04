import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    user: {
      count: mocks.count,
      findMany: mocks.findMany,
    },
    aIUsage: {
      groupBy: mocks.groupBy,
    },
    $transaction: mocks.transaction,
  },
}));

const { listAdminUsers } = await import("@/lib/server/admin/users-directory");

describe("listAdminUsers", () => {
  beforeEach(() => {
    mocks.count.mockReset();
    mocks.findMany.mockReset();
    mocks.groupBy.mockReset();
    mocks.transaction.mockReset();
  });

  it("returns paginated user rows with last-seen and usage aggregates", async () => {
    const createdAt = new Date("2026-03-01T00:00:00.000Z");
    const lastSeenAt = new Date("2026-03-03T00:00:00.000Z");

    mocks.count.mockReturnValue("count-query");
    mocks.findMany.mockReturnValue("find-query");
    mocks.transaction.mockResolvedValue([
      1,
      [
        {
          id: "u1",
          name: "Admin One",
          email: "admin@example.com",
          createdAt,
          emailVerified: true,
          isPlatformAdmin: true,
          sessions: [{ updatedAt: lastSeenAt }],
          _count: { memberships: 2, projects: 3 },
        },
      ],
    ]);

    mocks.groupBy.mockResolvedValue([
      {
        userId: "u1",
        _sum: {
          inputTokens: 100,
          outputTokens: 40,
        },
      },
    ]);

    const result = await listAdminUsers({
      page: 1,
      pageSize: 25,
      admin: "all",
      sort: "created_desc",
    });

    expect(result.totalCount).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: "u1",
      lastSeenAt,
      workspaceCount: 2,
      projectCount: 3,
      inputTokens7d: 100,
      outputTokens7d: 40,
      totalTokens7d: 140,
    });
    expect(mocks.groupBy).toHaveBeenCalledTimes(1);
  });

  it("applies search/admin/date filters to the user query", async () => {
    mocks.count.mockReturnValue("count-query");
    mocks.findMany.mockReturnValue("find-query");
    mocks.transaction.mockResolvedValue([0, []]);
    mocks.groupBy.mockResolvedValue([]);

    const createdFrom = new Date("2026-02-01T00:00:00.000Z");
    const createdTo = new Date("2026-02-28T23:59:59.999Z");
    const seenFrom = new Date("2026-03-01T00:00:00.000Z");
    const seenTo = new Date("2026-03-04T23:59:59.999Z");

    await listAdminUsers({
      page: 0,
      pageSize: 1000,
      search: "cory",
      admin: "false",
      sort: "email_asc",
      createdFrom,
      createdTo,
      seenFrom,
      seenTo,
    });

    const countArg = mocks.count.mock.calls[0][0];
    expect(countArg.where.isPlatformAdmin).toBe(false);
    expect(countArg.where.createdAt).toEqual({ gte: createdFrom, lte: createdTo });
    expect(countArg.where.sessions).toEqual({
      some: {
        updatedAt: {
          gte: seenFrom,
          lte: seenTo,
        },
      },
    });
    expect(countArg.where.OR).toHaveLength(2);

    const findManyArg = mocks.findMany.mock.calls[0][0];
    expect(findManyArg.take).toBe(100);
    expect(findManyArg.skip).toBe(0);
    expect(findManyArg.orderBy[0]).toEqual({ email: "asc" });
  });
});
