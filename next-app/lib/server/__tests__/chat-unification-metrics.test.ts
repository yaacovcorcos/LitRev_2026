import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatMetricCreate: vi.fn(),
  chatMetricFindMany: vi.fn(),
  agentRunFindFirst: vi.fn(),
  assertProjectAccess: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    chatUnificationMetric: {
      create: mocks.chatMetricCreate,
      findMany: mocks.chatMetricFindMany,
    },
    agentRun: {
      findFirst: mocks.agentRunFindFirst,
    },
  },
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mocks.assertProjectAccess(...args),
}));

const { ingestChatUnificationMetric } = await import("@/lib/server/chat-unification-metrics");

const AUTH = {
  userId: "user-1",
  workspaceId: "ws-1",
  role: "owner",
} as const;

describe("chat-unification-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ingests retry continuity intent metrics (v2) with server-enriched identity", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({ id: "run-1" });
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-1" });

    const result = await ingestChatUnificationMetric(AUTH, {
      eventId: "f7b7e4ad-a620-4b6d-bf93-2d9ce2f8ff2e",
      version: 2,
      type: "retry_model_continuity",
      surface: "ai",
      runId: "run-1",
      payload: {
        expectedModel: "gpt-5.2",
        requestKey: "889d119c-c2af-4ee6-a67d-c3ef98935d18",
        source: "retry_action",
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-1" });
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 2,
          type: "retry_model_continuity",
          surface: "ai",
          userId: "user-1",
          workspaceId: "ws-1",
          runId: "run-1",
        }),
      }),
    );
  });

  it("validates project access when projectId is provided", async () => {
    mocks.agentRunFindFirst.mockResolvedValue(null);
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-2" });

    await ingestChatUnificationMetric(AUTH, {
      eventId: "889d119c-c2af-4ee6-a67d-c3ef98935d18",
      type: "run_end_observed",
      surface: "project",
      projectId: "project-123",
      payload: {
        runStatus: "completed",
        streamPhase: "project_stream",
      },
    });

    expect(mocks.assertProjectAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-123",
    );
  });

  it("drops unverified runId values before persistence", async () => {
    mocks.agentRunFindFirst.mockResolvedValue(null);
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-3" });

    await ingestChatUnificationMetric(AUTH, {
      eventId: "5f53fa39-b95e-4f5a-8df7-3d8f34aef3ef",
      type: "stuck_running_tools_after_run_end",
      surface: "project",
      runId: "foreign-run",
      payload: {
        unresolvedCount: 1,
        runStatus: "failed",
        streamPhase: "project_stream",
      },
    });

    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: null,
        }),
      }),
    );
  });

  it("treats duplicate eventId writes as deduped success", async () => {
    mocks.agentRunFindFirst.mockResolvedValue(null);
    mocks.chatMetricCreate.mockRejectedValue({
      code: "P2002",
      meta: { target: ["eventId"] },
    });

    const result = await ingestChatUnificationMetric(AUTH, {
      eventId: "bb08be58-03d6-4f09-bd03-dd8a4a4fd005",
      type: "ask_user_context_mismatch",
      surface: "ai",
      payload: {
        mismatch: false,
        expectedPage: "draft",
        expectedSection: "intro",
        resolvedPage: "draft",
        resolvedSection: "intro",
      },
    });

    expect(result).toEqual({ deduped: true, id: null });
  });

  it("rejects payloads that do not match their metric type", async () => {
    await expect(
      ingestChatUnificationMetric(AUTH, {
        eventId: "9978b0f8-f40e-4468-8c15-74fd8efd5dcf",
        type: "retry_model_continuity",
        surface: "ai",
        payload: {
          mismatch: false,
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts legacy retry continuity payloads when version=1", async () => {
    mocks.agentRunFindFirst.mockResolvedValue(null);
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-legacy" });

    await ingestChatUnificationMetric(AUTH, {
      eventId: "0e67fd9a-55ef-4684-afec-f14eb26ca709",
      version: 1,
      type: "retry_model_continuity",
      surface: "project",
      payload: {
        preserved: true,
        expectedModel: "gpt-5.2",
        actualModel: "gpt-5.2",
        source: "retry_action",
      },
    });

    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
          type: "retry_model_continuity",
        }),
      }),
    );
  });
});
