import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    aIConversation: {
      findFirst: vi.fn(),
    },
    aIMessage: {
      findMany: vi.fn(),
    },
    artifact: {
      findMany: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockConvoFindFirst = vi.mocked(prisma.aIConversation.findFirst);
const mockMessageFindMany = vi.mocked(prisma.aIMessage.findMany);
const mockArtifactFindMany = vi.mocked(prisma.artifact.findMany);

const { getConversation, getConversationMessages } =
  await import("@/app/actions/conversations");

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMsg(id: string, createdAt: string, role = "assistant") {
  return {
    id,
    conversationId: "conv-1",
    role,
    content: `Message ${id}`,
    attachments: null,
    toolCalls: null,
    toolResultId: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

function mockConversation() {
  mockConvoFindFirst.mockResolvedValue({
    id: "conv-1",
    title: "Test",
    context: "project",
    page: "overview",
    projectId: "p1",
    studyId: null,
    userId: "local-user",
    workspaceId: "local-workspace",
    archived: false,
    createdAt: new Date("2026-02-20T00:00:00Z"),
    updatedAt: new Date("2026-02-20T12:00:00Z"),
    _count: { messages: 60 },
  } as never);
}

// ── getConversationMessages ──────────────────────────────────────────────────

describe("getConversationMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversation();
  });

  it("returns messages in ascending order", async () => {
    const msgs = [
      makeMsg("m3", "2026-02-20T03:00:00Z"),
      makeMsg("m2", "2026-02-20T02:00:00Z"),
      makeMsg("m1", "2026-02-20T01:00:00Z"),
    ];
    mockMessageFindMany.mockResolvedValue(msgs as never);

    const result = await getConversationMessages({
      conversationId: "conv-1",
      cursor: { createdAt: "2026-02-20T04:00:00Z", id: "m4" },
      limit: 5,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // 3 messages returned (< limit 5) → reversed to ascending
    expect(result.data.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("hasMore=true when DB returns more than limit (N+1 pattern)", async () => {
    // limit=2, DB returns 3 → hasMore true, only first 2 returned
    const msgs = [
      makeMsg("m3", "2026-02-20T03:00:00Z"),
      makeMsg("m2", "2026-02-20T02:00:00Z"),
      makeMsg("m1", "2026-02-20T01:00:00Z"),
    ];
    mockMessageFindMany.mockResolvedValue(msgs as never);

    const result = await getConversationMessages({
      conversationId: "conv-1",
      cursor: { createdAt: "2026-02-20T04:00:00Z", id: "m4" },
      limit: 2,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.hasMore).toBe(true);
    expect(result.data.messages).toHaveLength(2);
    // Oldest N+1 message (m1) sliced off, remaining reversed
    expect(result.data.messages.map((m) => m.id)).toEqual(["m2", "m3"]);
  });

  it("hasMore=false when fewer than limit remain", async () => {
    const msgs = [makeMsg("m1", "2026-02-20T01:00:00Z")];
    mockMessageFindMany.mockResolvedValue(msgs as never);

    const result = await getConversationMessages({
      conversationId: "conv-1",
      cursor: { createdAt: "2026-02-20T02:00:00Z", id: "m2" },
      limit: 5,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.hasMore).toBe(false);
    expect(result.data.messages).toHaveLength(1);
  });

  it("passes cursor as Date to Prisma (compound cursor with id tie-breaker)", async () => {
    mockMessageFindMany.mockResolvedValue([] as never);

    await getConversationMessages({
      conversationId: "conv-1",
      cursor: { createdAt: "2026-02-20T10:30:00.000Z", id: "cursor-msg" },
    });

    expect(mockMessageFindMany).toHaveBeenCalledOnce();
    const call = mockMessageFindMany.mock.calls[0][0] as Record<string, unknown>;
    const where = call.where as Record<string, unknown>;

    // conversationId filter
    expect(where.conversationId).toBe("conv-1");

    // OR clause with Date objects (not strings)
    const orClause = where.OR as Array<Record<string, unknown>>;
    expect(orClause).toHaveLength(2);

    // First: createdAt < cursorDate
    const ltClause = orClause[0] as Record<string, { lt: unknown }>;
    expect(ltClause.createdAt.lt).toBeInstanceOf(Date);
    expect((ltClause.createdAt.lt as Date).toISOString()).toBe("2026-02-20T10:30:00.000Z");

    // Second: createdAt = cursorDate AND id < cursorId
    const eqClause = orClause[1] as Record<string, { equals?: unknown; lt?: unknown }>;
    expect(eqClause.createdAt.equals).toBeInstanceOf(Date);
    expect(eqClause.id.lt).toBe("cursor-msg");
  });

  it("uses default limit of 50 when not specified", async () => {
    mockMessageFindMany.mockResolvedValue([] as never);

    await getConversationMessages({
      conversationId: "conv-1",
      cursor: { createdAt: "2026-02-20T00:00:00Z", id: "m1" },
    });

    const call = mockMessageFindMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call.take).toBe(51); // limit (50) + 1
  });

  it("orders by createdAt desc, id desc", async () => {
    mockMessageFindMany.mockResolvedValue([] as never);

    await getConversationMessages({
      conversationId: "conv-1",
      cursor: { createdAt: "2026-02-20T00:00:00Z", id: "m1" },
    });

    const call = mockMessageFindMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("returns empty array when no older messages exist", async () => {
    mockMessageFindMany.mockResolvedValue([] as never);

    const result = await getConversationMessages({
      conversationId: "conv-1",
      cursor: { createdAt: "2026-02-20T00:00:00Z", id: "m1" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.messages).toEqual([]);
    expect(result.data.hasMore).toBe(false);
  });

  it("returns empty results when conversation is not accessible", async () => {
    mockConvoFindFirst.mockResolvedValueOnce(null as never);

    const result = await getConversationMessages({
      conversationId: "conv-1",
      cursor: { createdAt: "2026-02-20T00:00:00Z", id: "m1" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.messages).toEqual([]);
    expect(result.data.hasMore).toBe(false);
    expect(mockMessageFindMany).not.toHaveBeenCalled();
  });
});

// ── getConversation (paginated initial load) ─────────────────────────────────

describe("getConversation — paginated initial load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns hasMore=true when conversation has more than messageLimit messages", async () => {
    mockConvoFindFirst.mockResolvedValue({
      id: "conv-1",
      title: "Test",
      context: "project",
      page: "overview",
      projectId: "p1",
      studyId: null,
      userId: "local-user",
      workspaceId: "local-workspace",
      archived: false,
      createdAt: new Date("2026-02-20T00:00:00Z"),
      updatedAt: new Date("2026-02-20T12:00:00Z"),
      _count: { messages: 60 },
    } as never);

    // Return 4 messages when limit=3 → hasMore=true
    const msgs = [
      makeMsg("m4", "2026-02-20T04:00:00Z"),
      makeMsg("m3", "2026-02-20T03:00:00Z"),
      makeMsg("m2", "2026-02-20T02:00:00Z"),
      makeMsg("m1", "2026-02-20T01:00:00Z"),
    ];
    mockMessageFindMany.mockResolvedValue(msgs as never);
    mockArtifactFindMany.mockResolvedValue([] as never);

    const result = await getConversation("conv-1", { messageLimit: 3 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.hasMore).toBe(true);
    expect(result.data!.messages).toHaveLength(3);
    // Reversed to ascending: m2, m3, m4 (m1 sliced as N+1)
    expect(result.data!.messages.map((m) => m.id)).toEqual(["m2", "m3", "m4"]);
  });

  it("returns hasMore=false when all messages fit in one page", async () => {
    mockConvoFindFirst.mockResolvedValue({
      id: "conv-1",
      title: "Test",
      context: "project",
      page: "overview",
      projectId: "p1",
      studyId: null,
      userId: "local-user",
      workspaceId: "local-workspace",
      archived: false,
      createdAt: new Date("2026-02-20T00:00:00Z"),
      updatedAt: new Date("2026-02-20T12:00:00Z"),
      _count: { messages: 2 },
    } as never);

    const msgs = [
      makeMsg("m2", "2026-02-20T02:00:00Z"),
      makeMsg("m1", "2026-02-20T01:00:00Z"),
    ];
    mockMessageFindMany.mockResolvedValue(msgs as never);
    mockArtifactFindMany.mockResolvedValue([] as never);

    const result = await getConversation("conv-1", { messageLimit: 50 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.hasMore).toBe(false);
    expect(result.data!.messages).toHaveLength(2);
    expect(result.data!.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("returns null when conversation not found", async () => {
    mockConvoFindFirst.mockResolvedValue(null as never);

    const result = await getConversation("nonexistent");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBeNull();
  });
});
