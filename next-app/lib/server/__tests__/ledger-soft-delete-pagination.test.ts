import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: vi.fn(async () => ({ workspaceId: "ws-1" })),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    study: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

import {
  deleteStudies,
  deleteStudy,
  listStudies,
  listStudiesPaginated,
  upsertStudy,
} from "../ledger";

const SCOPE = { ownerId: "user-1", workspaceId: "ws-1" };
const PROJECT_ID = "project-1";

const studyRow = {
  id: "study-1",
  projectId: PROJECT_ID,
  title: "Study A",
  authors: "Doe",
  year: 2024,
  status: "pending",
  quality: "-",
  details: {},
  deletedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("ledger soft delete + pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listStudies excludes soft-deleted rows", async () => {
    mockFindMany.mockResolvedValue([studyRow]);

    const result = await listStudies(SCOPE, PROJECT_ID);

    expect(result).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  });

  it("listStudiesPaginated returns nextCursor when limit exceeded", async () => {
    mockFindMany.mockResolvedValue([
      { ...studyRow, id: "study-1", createdAt: new Date("2026-01-01") },
      { ...studyRow, id: "study-2", createdAt: new Date("2026-01-02") },
      { ...studyRow, id: "study-3", createdAt: new Date("2026-01-03") },
    ]);

    const result = await listStudiesPaginated(SCOPE, PROJECT_ID, { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe("study-2");
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 3,
    });
  });

  it("listStudiesPaginated applies cursor filter", async () => {
    mockFindFirst.mockResolvedValue({
      id: "study-cursor",
      createdAt: new Date("2026-01-10"),
    });
    mockFindMany.mockResolvedValue([studyRow]);

    await listStudiesPaginated(SCOPE, PROJECT_ID, { cursor: "study-cursor", limit: 2 });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "study-cursor", projectId: PROJECT_ID, deletedAt: null },
      select: { id: true, createdAt: true },
    });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        projectId: PROJECT_ID,
        deletedAt: null,
        OR: [
          { createdAt: { gt: new Date("2026-01-10") } },
          { createdAt: { equals: new Date("2026-01-10") }, id: { gt: "study-cursor" } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 3,
    });
  });

  it("deleteStudy soft-deletes via updateMany", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await deleteStudy(SCOPE, PROJECT_ID, "study-1");

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "study-1", projectId: PROJECT_ID, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("deleteStudies soft-deletes via updateMany", async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });

    await deleteStudies(SCOPE, PROJECT_ID, ["study-1", "study-2"]);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["study-1", "study-2"] }, projectId: PROJECT_ID, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("upsertStudy restores soft-deleted rows", async () => {
    mockFindFirst.mockResolvedValue({ ...studyRow, deletedAt: new Date("2026-01-12") });
    mockUpdate.mockResolvedValue(studyRow);

    await upsertStudy(SCOPE, PROJECT_ID, {
      id: "study-1",
      title: "Study A",
      authors: "Doe",
      year: 2024,
      status: "pending",
      quality: "-",
      details: {},
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "study-1" },
      data: expect.objectContaining({ deletedAt: null }),
    });
  });
});
