import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationCreate: vi.fn(),
  conversationFindFirst: vi.fn(),
  resolveOwnedConversationScope: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    aIConversation: {
      create: mocks.conversationCreate,
      findFirst: mocks.conversationFindFirst,
    },
  },
}));

vi.mock("@/lib/server/access", () => ({
  resolveOwnedConversationScope: mocks.resolveOwnedConversationScope,
}));

vi.mock("@/lib/server/action-utils", () => ({
  withValidatedAction: async (_schema: unknown, rawInput: unknown, fn: (input: unknown) => Promise<unknown>) => ({
    success: true,
    data: await fn(rawInput),
  }),
}));

vi.mock("@/lib/server/auth/session", () => ({
  withAuth: (handler: (session: { userId: string; workspaceId: string }) => Promise<unknown>) =>
    handler({ userId: "user-1", workspaceId: "ws-1" }),
}));

import { createConversation, getOrCreateConversation } from "@/app/actions/conversations";

describe("conversation scope actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveOwnedConversationScope.mockResolvedValue({
      ownerId: "user-1",
      workspaceId: "ws-1",
      projectId: "project-owned",
      studyId: "study-owned",
      context: "study",
    });
    mocks.conversationCreate.mockResolvedValue({
      id: "conv-1",
      context: "study",
      page: "study",
      projectId: "project-owned",
      studyId: "study-owned",
      createdAt: new Date("2026-04-16T10:00:00.000Z"),
      updatedAt: new Date("2026-04-16T10:00:00.000Z"),
    });
    mocks.conversationFindFirst.mockResolvedValue(null);
  });

  it("creates conversations from canonical owned scope instead of caller-supplied ids", async () => {
    const result = await createConversation({
      projectId: "project-foreign",
      studyId: "study-foreign",
      page: "study",
      context: "project",
      title: "Evidence review",
    });

    expect(result.success).toBe(true);
    expect(mocks.resolveOwnedConversationScope).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "ws-1" },
      {
        projectId: "project-foreign",
        studyId: "study-foreign",
      },
    );
    expect(mocks.conversationCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        workspaceId: "ws-1",
        projectId: "project-owned",
        studyId: "study-owned",
        page: "study",
        context: "study",
        title: "Evidence review",
      },
    });
  });

  it("uses canonical global scope when getting or creating a conversation without project or study ids", async () => {
    mocks.resolveOwnedConversationScope.mockResolvedValueOnce({
      ownerId: "user-1",
      workspaceId: "ws-1",
      projectId: null,
      studyId: null,
      context: "global",
    });
    mocks.conversationCreate.mockResolvedValueOnce({
      id: "conv-global",
      context: "global",
      page: "ai",
      projectId: null,
      studyId: null,
      createdAt: new Date("2026-04-16T10:00:00.000Z"),
      updatedAt: new Date("2026-04-16T10:00:00.000Z"),
    });

    const result = await getOrCreateConversation({ page: "ai" });

    expect(result.success).toBe(true);
    expect(mocks.conversationFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        workspaceId: "ws-1",
        projectId: null,
        studyId: null,
        context: "global",
        page: "ai",
        archived: false,
      },
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    expect(mocks.conversationCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        workspaceId: "ws-1",
        projectId: null,
        studyId: null,
        page: "ai",
        context: "global",
      },
    });
  });
});
