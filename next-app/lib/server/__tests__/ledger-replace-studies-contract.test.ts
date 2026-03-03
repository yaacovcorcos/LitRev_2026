import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTxStudy = {
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  findMany: vi.fn(),
};
const mockTransaction = vi.fn(async (handler: (tx: { study: typeof mockTxStudy }) => Promise<unknown>) =>
  handler({ study: mockTxStudy }),
);

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: vi.fn(async () => ({ workspaceId: "ws-1" })),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    $transaction: (handler: (tx: { study: typeof mockTxStudy }) => Promise<unknown>) =>
      mockTransaction(handler),
  },
}));

import { replaceStudies } from "../ledger";

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

describe("replaceStudies contract guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty payload unless clear_all is explicitly requested", async () => {
    await expect(replaceStudies(SCOPE, PROJECT_ID, [])).rejects.toThrow(
      'emptyBehavior="clear_all"',
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects non-empty payloads that do not provide stable study ids", async () => {
    const studyWithoutId = {
      title: "Study A",
      authors: "Doe",
      year: 2024,
      status: "pending" as const,
      quality: "-" as const,
      details: {},
    };

    await expect(replaceStudies(SCOPE, PROJECT_ID, [studyWithoutId])).rejects.toThrow(
      "requires an id for every incoming study",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("allows explicit clear_all and soft-deletes active studies", async () => {
    mockTxStudy.updateMany.mockResolvedValue({ count: 2 });
    mockTxStudy.findMany.mockResolvedValue([]);

    const result = await replaceStudies(SCOPE, PROJECT_ID, [], { emptyBehavior: "clear_all" });

    expect(mockTxStudy.updateMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockTxStudy.create).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("keeps sync semantics for non-empty payloads with ids", async () => {
    mockTxStudy.updateMany.mockResolvedValue({ count: 0 });
    mockTxStudy.findFirst.mockResolvedValue({ id: "study-1" });
    mockTxStudy.update.mockResolvedValue(studyRow);
    mockTxStudy.findMany.mockResolvedValue([studyRow]);

    const result = await replaceStudies(SCOPE, PROJECT_ID, [
      {
        id: "study-1",
        title: "Study A",
        authors: "Doe",
        year: 2024,
        status: "pending",
        quality: "-",
        details: {},
      },
    ]);

    expect(mockTxStudy.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: PROJECT_ID,
        deletedAt: null,
        id: { notIn: ["study-1"] },
      },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockTxStudy.update).toHaveBeenCalledWith({
      where: { id: "study-1" },
      data: expect.objectContaining({ deletedAt: null }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("study-1");
  });
});
