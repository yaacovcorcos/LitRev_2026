import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

async function loadClaimModule() {
  const [{ prisma }, claimModule] = await Promise.all([
    import("@/lib/server/prisma"),
    import("@/lib/server/auth/claim"),
  ]);
  return {
    claimLegacySingleUserData: claimModule.claimLegacySingleUserData,
    transactionMock: prisma.$transaction as ReturnType<typeof vi.fn>,
  };
}

describe("claimLegacySingleUserData", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects blank input IDs", async () => {
    const { claimLegacySingleUserData } = await loadClaimModule();

    await expect(
      claimLegacySingleUserData({ userId: " ", workspaceId: "workspace-1" }),
    ).rejects.toThrow("claimLegacySingleUserData requires userId and workspaceId.");

    await expect(
      claimLegacySingleUserData({ userId: "user-1", workspaceId: " " }),
    ).rejects.toThrow("claimLegacySingleUserData requires userId and workspaceId.");
  });

  it("runs claim once per user and returns no-op result on repeated calls", async () => {
    const { claimLegacySingleUserData, transactionMock } = await loadClaimModule();
    transactionMock.mockResolvedValue({
      claimed: true,
      movedProjects: 3,
      movedConversations: 5,
      movedUsageRows: 2,
      movedUserMemories: 4,
      backfilledStudies: 7,
      backfilledFiles: 8,
      debug: {
        movedRunsByProject: 1,
        movedArtifactsByProject: 1,
        movedNotesByProject: 1,
        movedRetrievalsByProject: 1,
        movedEmbeddingsByProject: 1,
        movedAutonomyByProject: 1,
      },
    });

    const first = await claimLegacySingleUserData({
      userId: "user-claim-1",
      workspaceId: "workspace-claim-1",
    });
    const second = await claimLegacySingleUserData({
      userId: "user-claim-1",
      workspaceId: "workspace-claim-1",
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      claimed: true,
      movedProjects: 3,
      movedConversations: 5,
      movedUsageRows: 2,
      movedUserMemories: 4,
      backfilledStudies: 7,
      backfilledFiles: 8,
    });
    expect(second).toEqual({
      claimed: false,
      movedProjects: 0,
      movedConversations: 0,
      movedUsageRows: 0,
      movedUserMemories: 0,
      backfilledStudies: 0,
      backfilledFiles: 0,
    });
  });
});
