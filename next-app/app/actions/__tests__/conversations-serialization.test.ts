import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  conversationUpdateMany: vi.fn(),
  messageCreate: vi.fn(),
  transaction: vi.fn(),
  txConversationCreate: vi.fn(),
  txMessageCreateMany: vi.fn(),
  txSummaryCreate: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    aIConversation: {
      findFirst: mocks.conversationFindFirst,
      updateMany: mocks.conversationUpdateMany,
    },
    aIMessage: {
      create: mocks.messageCreate,
    },
    $transaction: mocks.transaction,
  },
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

import { addMessage, branchConversation } from "@/app/actions/conversations";

describe("conversation JSON serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.messageCreate.mockResolvedValue({ id: "msg-1" });
    mocks.txConversationCreate.mockResolvedValue({
      id: "branch-1",
      title: "Branched conversation",
      context: "project",
      page: "overview",
      projectId: "project-1",
      studyId: null,
      createdAt: new Date("2026-04-03T00:00:00Z"),
      updatedAt: new Date("2026-04-03T00:05:00Z"),
    });
    mocks.txMessageCreateMany.mockResolvedValue({ count: 1 });
    mocks.txSummaryCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
      handler({
        aIConversation: { create: mocks.txConversationCreate },
        aIMessage: { createMany: mocks.txMessageCreateMany },
        conversationSummary: { create: mocks.txSummaryCreate },
      }));
  });

  it("persists attachments through addMessage as Prisma JSON input", async () => {
    mocks.conversationFindFirst.mockResolvedValue({ id: "conv-1" });

    const attachments = [
      {
        fileAssetId: "file-1",
        filename: "study.pdf",
        mimeType: "application/pdf",
        size: 1024,
      },
    ];

    const result = await addMessage({
      conversationId: "conv-1",
      role: "assistant",
      content: "Attached evidence",
      attachments,
    });

    expect(result.success).toBe(true);
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: {
        conversationId: "conv-1",
        role: "assistant",
        content: "Attached evidence",
        attachments,
      },
    });
  });

  it("preserves toolCalls and attachments when branching a conversation", async () => {
    const toolCalls = [{ id: "call-1", name: "search_pubmed", arguments: { query: "heart disease" } }];
    const attachments = [
      {
        fileAssetId: "file-2",
        filename: "notes.txt",
        mimeType: "text/plain",
        size: 512,
      },
    ];

    mocks.conversationFindFirst.mockResolvedValue({
      id: "conv-1",
      userId: "user-1",
      workspaceId: "ws-1",
      title: "Source conversation",
      context: "project",
      page: "overview",
      projectId: "project-1",
      studyId: null,
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "Searching now",
          toolCalls,
          toolResultId: null,
          attachments,
          createdAt: new Date("2026-04-03T00:00:00Z"),
        },
      ],
      summary: null,
      _count: { messages: 1 },
    });

    const result = await branchConversation({ conversationId: "conv-1" });

    expect(result.success).toBe(true);
    expect(mocks.txMessageCreateMany).toHaveBeenCalledWith({
      data: [
        {
          conversationId: "branch-1",
          role: "assistant",
          content: "Searching now",
          toolCalls,
          toolResultId: null,
          attachments,
          createdAt: new Date("2026-04-03T00:00:00Z"),
        },
      ],
    });
  });
});
