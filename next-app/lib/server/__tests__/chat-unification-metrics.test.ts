import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_UNIFICATION_METRIC_VERSION } from "@/types/chat-unification";

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

  it("ingests retry continuity metrics with server-enriched identity", async () => {
    mocks.agentRunFindFirst.mockResolvedValue({ id: "run-1" });
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-1" });

    const result = await ingestChatUnificationMetric(AUTH, {
      eventId: "f7b7e4ad-a620-4b6d-bf93-2d9ce2f8ff2e",
      type: "retry_model_continuity",
      surface: "ai",
      runId: "run-1",
      payload: {
        requestKey: "57f83cc1-fd08-4204-8d34-5b14b84f0d91",
        expectedModel: "gpt-5.2",
        source: "retry_action",
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-1" });
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "retry_model_continuity",
          version: CHAT_UNIFICATION_METRIC_VERSION,
          surface: "ai",
          userId: "user-1",
          workspaceId: "ws-1",
          runId: "run-1",
        }),
      }),
    );
  });

  it("accepts explicit metric version 3 payloads", async () => {
    mocks.agentRunFindFirst.mockResolvedValue(null);
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-v3" });

    const result = await ingestChatUnificationMetric(AUTH, {
      eventId: "d15ea95a-b1da-449c-a132-c71ca6a6c568",
      version: 3,
      type: "retry_model_continuity",
      surface: "project",
      payload: {
        requestKey: "7b1ca9fd-5e5b-4d7b-a2e4-2b3d8f2af1f8",
        expectedModel: "claude-sonnet",
        source: "retry_action",
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-v3" });
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 3,
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

  it("accepts legacy metric version payloads for compatibility", async () => {
    mocks.agentRunFindFirst.mockResolvedValue(null);
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-legacy" });

    await ingestChatUnificationMetric(AUTH, {
      eventId: "6f37f8d2-4d6e-4338-9554-20d0eb37ec75",
      version: 1,
      type: "run_end_observed",
      surface: "ai",
      payload: {
        runStatus: "completed",
        streamPhase: "send",
      },
    });

    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
        }),
      }),
    );
  });

  it("preserves legacy retry payload shape for historical continuity analytics", async () => {
    mocks.agentRunFindFirst.mockResolvedValue(null);
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-legacy-retry" });

    await ingestChatUnificationMetric(AUTH, {
      eventId: "7d6319fc-3a4d-4d4c-9eb2-e8ec3b4661cb",
      version: 2,
      type: "retry_model_continuity",
      surface: "ai",
      payload: {
        preserved: true,
        expectedModel: "gpt-4.1",
        actualModel: "gpt-4.1",
        actualModelSource: "provider",
        source: "retry_action",
      },
    });

    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 2,
          payload: expect.objectContaining({
            preserved: true,
            expectedModel: "gpt-4.1",
            actualModel: "gpt-4.1",
            actualModelSource: "provider",
            source: "retry_action",
          }),
        }),
      }),
    );
  });
});
