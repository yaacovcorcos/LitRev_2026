import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFindUnique: vi.fn(),
  assertProjectAccess: vi.fn(),
  assertStudyAccess: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    aIConversation: {
      findUnique: mocks.conversationFindUnique,
    },
  },
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: mocks.assertProjectAccess,
  assertStudyAccess: mocks.assertStudyAccess,
}));

const { getConversationWithSummaryById } = await import("@/lib/server/ai/memory");

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    context: "project",
    projectId: "project-1",
    studyId: null,
    archived: false,
    messages: [],
    summary: null,
    createdAt: new Date("2026-05-05T20:00:00.000Z"),
    updatedAt: new Date("2026-05-05T20:00:00.000Z"),
    ...overrides,
  };
}

describe("conversation adoption access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversationFindUnique.mockResolvedValue(conversation());
    mocks.assertProjectAccess.mockResolvedValue({
      ownerId: "user-1",
      workspaceId: "workspace-1",
    });
    mocks.assertStudyAccess.mockResolvedValue({
      ownerId: "user-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      studyId: "study-1",
    });
  });

  it("denies null-owned legacy conversations instead of implicitly claiming them", async () => {
    mocks.conversationFindUnique.mockResolvedValueOnce(conversation({
      userId: null,
      workspaceId: null,
    }));

    await expect(getConversationWithSummaryById(
      "conv-legacy",
      "user-1",
      "workspace-1",
    )).resolves.toBeNull();

    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
    expect(mocks.assertStudyAccess).not.toHaveBeenCalled();
  });

  it("denies a foreign owner before adopting stored project scope", async () => {
    mocks.conversationFindUnique.mockResolvedValueOnce(conversation({ userId: "user-2" }));

    await expect(getConversationWithSummaryById(
      "conv-foreign",
      "user-1",
      "workspace-1",
    )).resolves.toBeNull();

    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
  });

  it("denies adoption when the stored project is outside the actor scope", async () => {
    mocks.assertProjectAccess.mockRejectedValueOnce(new Error("Project not found or access denied."));

    await expect(getConversationWithSummaryById(
      "conv-1",
      "user-1",
      "workspace-1",
    )).resolves.toBeNull();

    expect(mocks.assertProjectAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "project-1",
    );
  });

  it("revalidates study ownership and returns its canonical project scope", async () => {
    mocks.conversationFindUnique.mockResolvedValueOnce(conversation({
      context: "study",
      projectId: null,
      studyId: "study-1",
    }));

    const result = await getConversationWithSummaryById(
      "conv-1",
      "user-1",
      "workspace-1",
    );

    expect(mocks.assertStudyAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "study-1",
      null,
    );
    expect(result).toMatchObject({
      id: "conv-1",
      projectId: "project-1",
      studyId: "study-1",
    });
  });

  it("preserves an exactly owned global conversation without resource checks", async () => {
    mocks.conversationFindUnique.mockResolvedValueOnce(conversation({
      context: "global",
      projectId: null,
      studyId: null,
    }));

    const result = await getConversationWithSummaryById(
      "conv-global",
      "user-1",
      "workspace-1",
    );

    expect(result).toMatchObject({ id: "conv-1", context: "global" });
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
    expect(mocks.assertStudyAccess).not.toHaveBeenCalled();
  });
});
