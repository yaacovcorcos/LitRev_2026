import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  TelemetryAnonymousNotAllowedError,
  TelemetryProjectAccessDeniedError,
} from "@/lib/server/telemetry-policy";
import {
  RELIABILITY_METRIC_TYPE_VALUES,
  type ReliabilityMetricPayloadByType,
  type ReliabilityMetricType,
  type ReliabilitySurface,
} from "@/types/reliability-telemetry";

const mocks = vi.hoisted(() => ({
  chatMetricCreate: vi.fn(),
  assertProjectAccess: vi.fn(),
  conversationFindFirst: vi.fn(),
  runFindFirst: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    chatUnificationMetric: {
      create: mocks.chatMetricCreate,
    },
    aIConversation: {
      findFirst: mocks.conversationFindFirst,
    },
    agentRun: {
      findFirst: mocks.runFindFirst,
    },
  },
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mocks.assertProjectAccess(...args),
}));

const {
  ingestReliabilityMetric,
  RELIABILITY_MAX_CLIENT_EVENT_AGE_MS,
  RELIABILITY_MAX_CLIENT_FUTURE_SKEW_MS,
} = await import("@/lib/server/reliability-metrics");

const TEST_NOW = new Date("2026-03-09T08:00:00.000Z");

const AUTH = {
  kind: "authenticated" as const,
  clientIp: "203.0.113.10",
  context: {
    userId: "user-1",
    workspaceId: "ws-1",
    role: "owner",
  },
};

const ANONYMOUS = {
  kind: "anonymous" as const,
  clientIp: "203.0.113.11",
};

const COMMON_INPUT = {
  version: 1,
  projectId: "project-1",
  clientTimestamp: "2026-03-09T08:00:00.000Z",
  dimensions: {
    viewport: "desktop",
    network: "online",
    flags: {
      scrollOwnershipA1: true,
      streamReliabilityA2: null,
      mobileScrollLockV2: false,
    },
  },
} as const;

type ValidMetricFixtures = {
  [TType in ReliabilityMetricType]: {
    surface: ReliabilitySurface;
    payload: ReliabilityMetricPayloadByType[TType];
  };
};

const VALID_METRICS = {
  "reliability.v1.stream.started": {
    surface: "ai",
    payload: { requestKey: "request-1", phase: "send" },
  },
  "reliability.v1.stream.terminal": {
    surface: "project",
    payload: {
      requestKey: "request-2",
      phase: "project_stream",
      reason: "paused_for_input",
      runStatus: "paused",
    },
  },
  "reliability.v1.stream.stuck_watchdog_fired": {
    surface: "popup",
    payload: { requestKey: "request-3", inactivityMs: 10_000 },
  },
  "reliability.v1.retry.clicked": {
    surface: "ai",
    payload: { requestKey: "request-4", source: "retry_button" },
  },
  "reliability.v1.shell.session_started": {
    surface: "shell",
    payload: { sessionId: "shell-session-1" },
  },
  "reliability.v1.shell.session_ended": {
    surface: "shell",
    payload: { sessionId: "shell-session-1", durationMs: 32_000 },
  },
  "reliability.v1.shell.dead_scroll_detected": {
    surface: "shell",
    payload: {
      sessionId: "shell-session-1",
      input: "wheel",
      blockedDurationMs: 2_100,
      shellMode: "view",
    },
  },
  "reliability.v1.route.ready": {
    surface: "protocol",
    payload: {
      routeTemplate: "/project/[id]/protocol",
      state: "content",
      layoutMode: "embedded",
    },
  },
  "reliability.v1.route.flow_completed": {
    surface: "home",
    payload: {
      routeTemplate: "/",
      flow: "open_sample_review",
      layoutMode: null,
    },
  },
} satisfies ValidMetricFixtures;

const VALID_METRIC_CASES = RELIABILITY_METRIC_TYPE_VALUES.map((type) => ({
  type,
  ...VALID_METRICS[type],
}));

describe("reliability-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(TEST_NOW.getTime());
    mocks.assertProjectAccess.mockResolvedValue({
      ownerId: AUTH.context.userId,
      workspaceId: AUTH.context.workspaceId,
    });
    mocks.runFindFirst.mockResolvedValue({
      id: "run-1",
      projectId: "project-1",
      conversationId: "conv-1",
    });
    mocks.conversationFindFirst.mockResolvedValue({
      id: "conv-1",
      projectId: "project-1",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts compact viewport telemetry and scopes project access", async () => {
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-1" });

    const result = await ingestReliabilityMetric(AUTH, {
      eventId: "evt-1",
      version: 1,
      type: "reliability.v1.stream.started",
      surface: "project",
      projectId: "project-1",
      conversationId: "conv-1",
      runId: "run-1",
      clientTimestamp: "2026-03-08T10:00:00.000Z",
      dimensions: {
        viewport: "compact",
        network: "online",
        flags: {
          scrollOwnershipA1: null,
          streamReliabilityA2: null,
          mobileScrollLockV2: true,
        },
      },
      payload: {
        requestKey: "req-1",
        phase: "project_stream",
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-1" });
    expect(mocks.assertProjectAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
    );
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "reliability.v1.stream.started",
          surface: "project",
          userId: "user-1",
          workspaceId: "ws-1",
          projectId: "project-1",
          runId: "run-1",
          conversationId: "conv-1",
          clientTimestamp: new Date("2026-03-08T10:00:00.000Z"),
        }),
      }),
    );
  });

  it("derives canonical project and conversation attribution from an owned run", async () => {
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-derived-scope" });

    await ingestReliabilityMetric(AUTH, {
      ...COMMON_INPUT,
      eventId: "event-derived-scope",
      type: "reliability.v1.stream.terminal",
      surface: "project",
      projectId: null,
      conversationId: null,
      runId: "run-1",
      payload: {
        requestKey: "request-derived-scope",
        phase: "project_stream",
        reason: "completed",
        runStatus: "completed",
      },
    });

    expect(mocks.runFindFirst).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        OR: [
          { projectId: null, userId: "user-1" },
          { project: { ownerId: "user-1", workspaceId: "ws-1" } },
        ],
      },
      select: { id: true, projectId: true, conversationId: true },
    });
    expect(mocks.conversationFindFirst).toHaveBeenCalledWith({
      where: { id: "conv-1", userId: "user-1", workspaceId: "ws-1" },
      select: { id: true, projectId: true },
    });
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "project-1",
          conversationId: "conv-1",
          runId: "run-1",
        }),
      }),
    );
  });

  it.each([
    {
      name: "project owned by another user",
      prepare: () => mocks.assertProjectAccess.mockRejectedValueOnce(
        new Error("Project not found or access denied."),
      ),
      ids: { projectId: "project-foreign" },
    },
    {
      name: "conversation owned by another user",
      prepare: () => mocks.conversationFindFirst.mockResolvedValueOnce(null),
      ids: { conversationId: "conv-foreign" },
    },
    {
      name: "run outside the actor project scope",
      prepare: () => mocks.runFindFirst.mockResolvedValueOnce(null),
      ids: { runId: "run-foreign" },
    },
  ])("rejects $name", async ({ prepare, ids }) => {
    prepare();

    await expect(ingestReliabilityMetric(AUTH, {
      ...COMMON_INPUT,
      projectId: null,
      ...ids,
      eventId: "event-cross-user-scope",
      type: "reliability.v1.stream.started",
      surface: "ai",
      payload: { requestKey: "request-cross-user", phase: "send" },
    })).rejects.toBeInstanceOf(TelemetryProjectAccessDeniedError);

    expect(mocks.chatMetricCreate).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "run and submitted conversation",
      prepare: () => mocks.runFindFirst.mockResolvedValueOnce({
        id: "run-1",
        projectId: "project-1",
        conversationId: "conv-other",
      }),
      ids: { projectId: "project-1", conversationId: "conv-1", runId: "run-1" },
    },
    {
      name: "run and submitted project",
      prepare: () => mocks.runFindFirst.mockResolvedValueOnce({
        id: "run-1",
        projectId: "project-other",
        conversationId: null,
      }),
      ids: { projectId: "project-1", runId: "run-1" },
    },
    {
      name: "conversation and submitted project",
      prepare: () => mocks.conversationFindFirst.mockResolvedValueOnce({
        id: "conv-1",
        projectId: "project-other",
      }),
      ids: { projectId: "project-1", conversationId: "conv-1" },
    },
    {
      name: "owned run and conversation projects",
      prepare: () => {
        mocks.runFindFirst.mockResolvedValueOnce({
          id: "run-1",
          projectId: "project-1",
          conversationId: "conv-1",
        });
        mocks.conversationFindFirst.mockResolvedValueOnce({
          id: "conv-1",
          projectId: "project-other",
        });
      },
      ids: { projectId: null, conversationId: "conv-1", runId: "run-1" },
    },
  ])("rejects mismatched $name attribution", async ({ prepare, ids }) => {
    prepare();

    await expect(ingestReliabilityMetric(AUTH, {
      ...COMMON_INPUT,
      ...ids,
      eventId: "event-mismatched-attribution",
      type: "reliability.v1.stream.started",
      surface: "project",
      payload: { requestKey: "request-mismatch", phase: "project_stream" },
    })).rejects.toBeInstanceOf(TelemetryProjectAccessDeniedError);

    expect(mocks.chatMetricCreate).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "stale",
      clientTimestamp: new Date(
        TEST_NOW.getTime() - RELIABILITY_MAX_CLIENT_EVENT_AGE_MS - 1,
      ).toISOString(),
    },
    {
      name: "future",
      clientTimestamp: new Date(
        TEST_NOW.getTime() + RELIABILITY_MAX_CLIENT_FUTURE_SKEW_MS + 1,
      ).toISOString(),
    },
  ])("rejects $name client timestamps before scope lookup or persistence", async ({ clientTimestamp }) => {
    await expect(ingestReliabilityMetric(AUTH, {
      ...COMMON_INPUT,
      eventId: `event-timestamp-${clientTimestamp}`,
      clientTimestamp,
      type: "reliability.v1.stream.started",
      surface: "project",
      payload: { requestKey: "request-timestamp", phase: "project_stream" },
    })).rejects.toBeInstanceOf(z.ZodError);

    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
    expect(mocks.runFindFirst).not.toHaveBeenCalled();
    expect(mocks.conversationFindFirst).not.toHaveBeenCalled();
    expect(mocks.chatMetricCreate).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "oldest accepted",
      clientTimestamp: new Date(
        TEST_NOW.getTime() - RELIABILITY_MAX_CLIENT_EVENT_AGE_MS,
      ).toISOString(),
    },
    {
      name: "maximum future skew",
      clientTimestamp: new Date(
        TEST_NOW.getTime() + RELIABILITY_MAX_CLIENT_FUTURE_SKEW_MS,
      ).toISOString(),
    },
  ])("accepts the $name client timestamp boundary", async ({ name, clientTimestamp }) => {
    mocks.chatMetricCreate.mockResolvedValue({ id: `metric-${name}` });

    const result = await ingestReliabilityMetric(AUTH, {
      ...COMMON_INPUT,
      eventId: `event-boundary-${name}`,
      clientTimestamp,
      type: "reliability.v1.stream.started",
      surface: "project",
      payload: { requestKey: "request-boundary", phase: "project_stream" },
    });

    expect(result.deduped).toBe(false);
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientTimestamp: new Date(clientTimestamp),
        }),
      }),
    );
  });

  it("accepts responsive route-ready telemetry for auth without project access", async () => {
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-2" });

    const result = await ingestReliabilityMetric(ANONYMOUS, {
      eventId: "evt-2",
      version: 1,
      type: "reliability.v1.route.ready",
      surface: "auth",
      clientTimestamp: "2026-03-09T08:00:00.000Z",
      dimensions: {
        viewport: "phone",
        network: "online",
        flags: {
          scrollOwnershipA1: null,
          streamReliabilityA2: null,
          mobileScrollLockV2: true,
        },
      },
      payload: {
        routeTemplate: "/login",
        state: "signin",
        layoutMode: null,
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-2" });
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "reliability.v1.route.ready",
          surface: "auth",
          userId: null,
          workspaceId: null,
          projectId: null,
        }),
      }),
    );
  });

  it("accepts responsive route-flow telemetry for allowed home flows", async () => {
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-3" });

    const result = await ingestReliabilityMetric(ANONYMOUS, {
      eventId: "evt-3",
      version: 1,
      type: "reliability.v1.route.flow_completed",
      surface: "home",
      clientTimestamp: "2026-03-09T08:00:00.000Z",
      dimensions: {
        viewport: "phone",
        network: "online",
        flags: {
          scrollOwnershipA1: null,
          streamReliabilityA2: null,
          mobileScrollLockV2: true,
        },
      },
      payload: {
        routeTemplate: "/",
        flow: "enter_workspace",
        layoutMode: null,
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-3" });
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
  });

  it.each(VALID_METRIC_CASES)("validates and persists $type payloads", async ({ type, surface, payload }) => {
    mocks.chatMetricCreate.mockResolvedValue({ id: `metric-${type}` });

    const result = await ingestReliabilityMetric(AUTH, {
      ...COMMON_INPUT,
      eventId: `event-${type}`,
      type,
      surface,
      payload,
    });

    expect(result.deduped).toBe(false);
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type,
          surface,
          payload: {
            dimensions: COMMON_INPUT.dimensions,
            payload,
          },
        }),
      }),
    );
  });

  it.each([
    {
      name: "payload from a different event type",
      input: {
        ...COMMON_INPUT,
        eventId: "invalid-mismatch",
        type: "reliability.v1.stream.started",
        surface: "ai",
        payload: { sessionId: "shell-session-1" },
      },
    },
    {
      name: "unknown payload fields",
      input: {
        ...COMMON_INPUT,
        eventId: "invalid-extra-field",
        type: "reliability.v1.retry.clicked",
        surface: "ai",
        payload: {
          requestKey: "request-1",
          source: "retry_button",
          unboundedMetadata: { rawPrompt: "must not be stored" },
        },
      },
    },
    {
      name: "dead-scroll durations below the detection contract",
      input: {
        ...COMMON_INPUT,
        eventId: "invalid-dead-scroll-duration",
        type: "reliability.v1.shell.dead_scroll_detected",
        surface: "shell",
        payload: {
          sessionId: "shell-session-1",
          input: "touch",
          blockedDurationMs: 1_999,
          shellMode: "conversation",
        },
      },
    },
    {
      name: "dead-scroll events outside the project shell",
      input: {
        ...COMMON_INPUT,
        eventId: "invalid-dead-scroll-surface",
        type: "reliability.v1.shell.dead_scroll_detected",
        surface: "ai",
        payload: {
          sessionId: "shell-session-1",
          input: "wheel",
          blockedDurationMs: 2_000,
          shellMode: "view",
        },
      },
    },
    {
      name: "unscoped dead-scroll events",
      input: {
        ...COMMON_INPUT,
        projectId: null,
        eventId: "invalid-dead-scroll-scope",
        type: "reliability.v1.shell.dead_scroll_detected",
        surface: "shell",
        payload: {
          sessionId: "shell-session-1",
          input: "wheel",
          blockedDurationMs: 2_000,
          shellMode: "view",
        },
      },
    },
  ])("rejects $name", async ({ input }) => {
    await expect(ingestReliabilityMetric(AUTH, input)).rejects.toBeInstanceOf(z.ZodError);
    expect(mocks.chatMetricCreate).not.toHaveBeenCalled();
  });

  it("rejects anonymous telemetry with scoped identifiers", async () => {
    await expect(
      ingestReliabilityMetric(ANONYMOUS, {
        eventId: "evt-4",
        version: 1,
        type: "reliability.v1.route.ready",
        surface: "auth",
        projectId: "project-1",
        clientTimestamp: "2026-03-09T08:00:00.000Z",
        dimensions: {
          viewport: "phone",
          network: "online",
          flags: {
            scrollOwnershipA1: null,
            streamReliabilityA2: null,
            mobileScrollLockV2: true,
          },
        },
        payload: {
          routeTemplate: "/login",
          state: "signin",
          layoutMode: null,
        },
      }),
    ).rejects.toBeInstanceOf(TelemetryAnonymousNotAllowedError);
    expect(mocks.chatMetricCreate).not.toHaveBeenCalled();
  });

  it("rejects anonymous stream telemetry", async () => {
    await expect(
      ingestReliabilityMetric(ANONYMOUS, {
        eventId: "evt-5",
        version: 1,
        type: "reliability.v1.stream.started",
        surface: "home",
        clientTimestamp: "2026-03-09T08:00:00.000Z",
        dimensions: {
          viewport: "phone",
          network: "online",
          flags: {
            scrollOwnershipA1: null,
            streamReliabilityA2: null,
            mobileScrollLockV2: true,
          },
        },
        payload: {
          requestKey: "request-1",
          phase: "send",
        },
      }),
    ).rejects.toBeInstanceOf(TelemetryAnonymousNotAllowedError);
  });
});
