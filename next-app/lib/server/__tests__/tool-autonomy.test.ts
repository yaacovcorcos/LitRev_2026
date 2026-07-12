import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactError } from "@/lib/server/agent/artifact-errors";

const mocks = vi.hoisted(() => {
  const span = {
    update: vi.fn().mockReturnThis(),
    end: vi.fn(),
  };
  return {
    emitEvent: vi.fn(),
    emitEventWithinTransaction: vi.fn(),
    createArtifact: vi.fn(),
    applyArtifact: vi.fn(),
    transaction: vi.fn(),
    createToolResultCheckpointInTransaction: vi.fn(),
    isCheckpointEligibleToolResult: vi.fn(),
    noteObservedRunActivity: vi.fn(),
    markRunDurabilityDegraded: vi.fn(),
    isToolAllowedInScope: vi.fn(),
    getTool: vi.fn(),
    resolveAutonomyLevel: vi.fn(),
    getEffectiveAllowedTools: vi.fn(),
    getAutonomyConfig: vi.fn(),
    getToolAutonomyLevel: vi.fn(),
    startToolSpan: vi.fn(() => span),
    span,
  };
});

vi.mock("@/lib/server/agent/events", () => ({
  emitEvent: mocks.emitEvent,
  emitEventWithinTransaction: mocks.emitEventWithinTransaction,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/server/agent/run-checkpoints", () => ({
  createToolResultCheckpointInTransaction: mocks.createToolResultCheckpointInTransaction,
  isCheckpointEligibleToolResult: mocks.isCheckpointEligibleToolResult,
}));

vi.mock("@/lib/server/agent/run", () => ({
  noteObservedRunActivity: mocks.noteObservedRunActivity,
  markRunDurabilityDegraded: mocks.markRunDurabilityDegraded,
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
  createArtifact: mocks.createArtifact,
  applyArtifact: mocks.applyArtifact,
}));

vi.mock("@/lib/server/ai/tools", () => ({
  isToolAllowedInScope: mocks.isToolAllowedInScope,
  getTool: mocks.getTool,
  resolveAutonomyLevel: mocks.resolveAutonomyLevel,
}));

vi.mock("@/lib/agent/router", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/agent/router")>();
  return {
    ...original,
    getEffectiveAllowedTools: mocks.getEffectiveAllowedTools,
  };
});

vi.mock("@/lib/server/agent/autonomy", () => ({
  getAutonomyConfig: mocks.getAutonomyConfig,
  getToolAutonomyLevel: mocks.getToolAutonomyLevel,
}));

vi.mock("@/lib/server/ai/tracing", () => ({
  startToolSpan: mocks.startToolSpan,
  NOOP_SPAN: {},
}));

const { executeToolWithAutonomy, executeToolWithAutonomyCore } = await import("@/lib/server/ai/tool-autonomy");
const { markIdempotencyReplayResult } = await import("@/lib/server/ai/tool-middleware");

describe("tool-autonomy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emitEvent.mockResolvedValue(undefined);
    mocks.emitEventWithinTransaction.mockResolvedValue({
      sequence: 1,
      createdAt: new Date("2026-03-14T12:00:00.000Z"),
    });
    mocks.createArtifact.mockResolvedValue(undefined);
    mocks.applyArtifact.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));
    mocks.createToolResultCheckpointInTransaction.mockResolvedValue(undefined);
    mocks.isCheckpointEligibleToolResult.mockReturnValue(true);
    mocks.noteObservedRunActivity.mockReturnValue(undefined);
    mocks.markRunDurabilityDegraded.mockResolvedValue(1);
    mocks.isToolAllowedInScope.mockReturnValue(true);
    mocks.getEffectiveAllowedTools.mockReturnValue([]);
    mocks.getAutonomyConfig.mockResolvedValue({ preset: "assisted", toolOverrides: {} });
    mocks.getToolAutonomyLevel.mockReturnValue(3);
    mocks.resolveAutonomyLevel.mockImplementation((_toolName, level) => level);
    mocks.getTool.mockReturnValue({
      definition: { name: "delegate_protocol", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [2, 4] },
    });
  });

  it("emits parent-visible artifact chunks from delegated artifact metadata", async () => {
    const service = {
      executeToolWithMiddleware: vi.fn().mockResolvedValue({
        callId: "tc1",
        result: {
          success: true,
          summary: "delegated",
          toolCallCount: 1,
          stopReason: "natural",
        },
        artifacts: [
          {
            artifactId: "artifact-1",
            artifactType: "protocol_suggestion",
            artifactTitle: "Protocol: researchQuestion",
            artifactStatus: "proposed",
            artifactPayload: { field: "researchQuestion", value: "RQ" },
            artifactVersion: 1,
            emitToClient: true,
          },
        ],
      }),
    };

    const gen = executeToolWithAutonomy(
      service as never,
      {
        id: "tc1",
        name: "delegate_protocol",
        arguments: { task: "update protocol" },
      },
      "run-1",
      "project-1",
      "conversation-1",
      "user-1",
      "general",
    );

    const first = await gen.next();
    expect(first.done).toBe(false);
    expect(first.value).toEqual(
      expect.objectContaining({
        type: "artifact",
        artifactId: "artifact-1",
        artifactStatus: "proposed",
      }),
    );

    const second = await gen.next();
    expect(second.done).toBe(true);
    expect((second.value as { artifacts?: unknown[] }).artifacts).toEqual([
      expect.objectContaining({
        artifactId: "artifact-1",
        artifactStatus: "proposed",
      }),
    ]);
  });

  it("returns structured blocked-by-autonomy results for delegated level-1 execution", async () => {
    mocks.getTool.mockReturnValue({
      definition: { name: "update_protocol", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [2, 4] },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(1);

    const result = await executeToolWithAutonomyCore({
      service: {
        executeToolWithMiddleware: vi.fn(),
      } as never,
      toolCall: {
        id: "tc1",
        name: "update_protocol",
        arguments: { field: "researchQuestion", value: "RQ" },
      },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      agentMode: "protocol",
      levelOneBehavior: "block",
    });

    expect(result.blockedByAutonomy).toBe(true);
    expect(result.blockedReason).toBe("approval_required");
    expect(result.errorMeta).toEqual(
      expect.objectContaining({
        kind: "autonomy_blocked",
        code: "TOOL_APPROVAL_REQUIRED",
        retryable: false,
      }),
    );
  });

  it("blocks direct mutations at review-first level 2", async () => {
    mocks.getTool.mockReturnValue({
      definition: { name: "add_to_ledger", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [2, 3] },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(2);
    const executeToolWithMiddleware = vi.fn();

    const result = await executeToolWithAutonomyCore({
      service: { executeToolWithMiddleware } as never,
      toolCall: {
        id: "tc-review-first",
        name: "add_to_ledger",
        arguments: { results: [{ title: "Study", authors: "Author" }] },
      },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      agentMode: "search",
    });

    expect(result.blockedByAutonomy).toBe(true);
    expect(result.blockedReason).toBe("approval_required");
    expect(executeToolWithMiddleware).not.toHaveBeenCalled();
  });

  it("still executes read-only tools at level 2", async () => {
    mocks.getTool.mockReturnValue({
      definition: { name: "search_pubmed", description: "d", parameters: {} },
      autonomy: { defaultLevel: 2, allowedRange: [1, 4] },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(2);
    const executeToolWithMiddleware = vi.fn().mockResolvedValue({
      callId: "tc-search",
      result: { results: [] },
    });

    const result = await executeToolWithAutonomyCore({
      service: { executeToolWithMiddleware } as never,
      toolCall: { id: "tc-search", name: "search_pubmed", arguments: { query: "diabetes" } },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      agentMode: "search",
    });

    expect(executeToolWithMiddleware).toHaveBeenCalledTimes(1);
    expect(result.error).toBeUndefined();
  });

  it("executes non-mutating PDF previews at review-first level 2", async () => {
    mocks.getTool.mockReturnValue({
      definition: { name: "preview_study_pdf_update", description: "d", parameters: {} },
      autonomy: { defaultLevel: 2, allowedRange: [2, 4] },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(2);
    const executeToolWithMiddleware = vi.fn().mockResolvedValue({
      callId: "tc-preview",
      result: { studyId: "study-1", changes: [] },
    });

    const result = await executeToolWithAutonomyCore({
      service: { executeToolWithMiddleware } as never,
      toolCall: {
        id: "tc-preview",
        name: "preview_study_pdf_update",
        arguments: { studyId: "study-1" },
      },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      agentMode: "screening",
    });

    expect(executeToolWithMiddleware).toHaveBeenCalledTimes(1);
    expect(result.error).toBeUndefined();
  });

  it("auto-applies direct-safe study updates at fixed level 3", async () => {
    mocks.getTool.mockReturnValue({
      definition: { name: "update_study_direct", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [3, 3], hardCap: 3 },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(3);
    mocks.createArtifact.mockResolvedValue({
      id: "artifact-study-update",
      type: "study_update",
      title: "Study metadata update",
      payload: { changes: [{ field: "details.abstract" }] },
      version: 1,
    });

    const result = await executeToolWithAutonomyCore({
      service: {
        executeToolWithMiddleware: vi.fn().mockResolvedValue({
          callId: "tc1",
          result: {
            studyId: "study-1",
            patch: { details: { abstract: "Updated" } },
            changes: [{ field: "details.abstract" }],
          },
        }),
      } as never,
      toolCall: {
        id: "tc1",
        name: "update_study_direct",
        arguments: { abstract: "Updated", rationale: "User asked" },
      },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      agentMode: "screening",
      studyId: "study-1",
      levelOneBehavior: "suggest",
    });

    expect(mocks.createArtifact).toHaveBeenCalledWith(expect.objectContaining({
      type: "study_update",
      title: "Study metadata update",
    }));
    expect(mocks.applyArtifact).toHaveBeenCalledWith("artifact-study-update", "auto_applied");
    expect(result.artifactStatus).toBe("auto_applied");
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        artifactId: "artifact-study-update",
        artifactStatus: "auto_applied",
      }),
    ]);
  });

  it("finalizes artifact effects before the middleware can complete its durable receipt", async () => {
    const order: string[] = [];
    mocks.getTool.mockReturnValue({
      definition: { name: "update_study_direct", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [3, 3], hardCap: 3 },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(3);
    mocks.createArtifact.mockImplementation(async () => {
      order.push("artifact-created");
      return {
        id: "artifact-study-update",
        type: "study_update",
        title: "Study metadata update",
        payload: { changes: [] },
        version: 1,
      };
    });
    mocks.applyArtifact.mockImplementation(async () => {
      order.push("artifact-applied");
    });
    const service = {
      executeToolWithMiddleware: vi.fn(async (
        _request: unknown,
        finalize: (result: { callId: string; result: unknown }) => Promise<unknown>,
      ) => {
        const finalized = await finalize({
          callId: "tc-order",
          result: { studyId: "study-1", patch: {}, changes: [] },
        });
        order.push("receipt-completed");
        return finalized;
      }),
    };

    const result = await executeToolWithAutonomyCore({
      service: service as never,
      toolCall: { id: "tc-order", name: "update_study_direct", arguments: { rationale: "test" } },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      studyId: "study-1",
      agentMode: "screening",
    });

    expect(order).toEqual(["artifact-created", "artifact-applied", "receipt-completed"]);
    expect(result.artifactStatus).toBe("auto_applied");
    expect(mocks.createArtifact).toHaveBeenCalledWith(expect.objectContaining({
      applyId: expect.stringMatching(/^tool-artifact:/),
    }));
  });

  it("does not create duplicate artifacts for idempotency replayed tool results", async () => {
    mocks.getTool.mockReturnValue({
      definition: { name: "update_protocol", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [2, 4] },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(3);

    const result = await executeToolWithAutonomyCore({
      service: {
        executeToolWithMiddleware: vi.fn().mockResolvedValue(markIdempotencyReplayResult({
          callId: "tc1",
          result: {
            field: "researchQuestion",
            value: "RQ",
            rationale: "User asked",
          },
        })),
      } as never,
      toolCall: {
        id: "tc1",
        name: "update_protocol",
        arguments: { field: "researchQuestion", value: "RQ", rationale: "User asked" },
      },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      agentMode: "protocol",
      levelOneBehavior: "suggest",
    });

    expect(mocks.createArtifact).not.toHaveBeenCalled();
    expect(mocks.applyArtifact).not.toHaveBeenCalled();
    expect(result.artifacts).toBeUndefined();
    expect(result.result).toEqual({
      field: "researchQuestion",
      value: "RQ",
      rationale: "User asked",
    });
  });

  it("propagates typed auto-apply failures from the shared artifact apply core", async () => {
    mocks.getTool.mockReturnValue({
      definition: { name: "update_study_direct", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [3, 3], hardCap: 3 },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(3);
    mocks.createArtifact.mockResolvedValue({
      id: "artifact-study-update",
      type: "study_update",
      title: "Study metadata update",
      payload: { changes: [{ field: "details.abstract" }] },
      version: 1,
    });
    mocks.applyArtifact.mockRejectedValue(
      new ArtifactError("ARTIFACT_APPLY_FAILED", "database connection dropped"),
    );

    await expect(executeToolWithAutonomyCore({
      service: {
        executeToolWithMiddleware: vi.fn().mockResolvedValue({
          callId: "tc1",
          result: {
            studyId: "study-1",
            patch: { details: { abstract: "Updated" } },
            changes: [{ field: "details.abstract" }],
          },
        }),
      } as never,
      toolCall: {
        id: "tc1",
        name: "update_study_direct",
        arguments: { abstract: "Updated", rationale: "User asked" },
      },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      agentMode: "screening",
      studyId: "study-1",
      levelOneBehavior: "suggest",
    })).rejects.toMatchObject({
      errorCode: "ARTIFACT_APPLY_FAILED",
    });

    expect(mocks.createArtifact).toHaveBeenCalledTimes(1);
    expect(mocks.applyArtifact).toHaveBeenCalledWith("artifact-study-update", "auto_applied");
    expect(mocks.span.end).toHaveBeenCalledTimes(1);
  });

  it("does not start artifact mutation phases after the owning tool signal is cancelled", async () => {
    const controller = new AbortController();
    mocks.getTool.mockReturnValue({
      definition: { name: "update_study_direct", description: "d", parameters: {} },
      autonomy: { defaultLevel: 3, allowedRange: [3, 3], hardCap: 3 },
    });
    mocks.getToolAutonomyLevel.mockReturnValue(3);
    const service = {
      executeToolWithMiddleware: vi.fn(async (
        _request: unknown,
        finalize: (result: { callId: string; result: unknown }) => Promise<unknown>,
      ) => {
        controller.abort();
        return finalize({
          callId: "tc-cancelled-finalization",
          result: { studyId: "study-1", patch: {}, changes: [] },
        });
      }),
    };

    await expect(executeToolWithAutonomyCore({
      service: service as never,
      toolCall: {
        id: "tc-cancelled-finalization",
        name: "update_study_direct",
        arguments: { rationale: "test" },
      },
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      userId: "user-1",
      studyId: "study-1",
      agentMode: "screening",
      runtimeContext: { signal: controller.signal },
    })).rejects.toMatchObject({ name: "AbortError" });

    expect(mocks.createArtifact).not.toHaveBeenCalled();
    expect(mocks.applyArtifact).not.toHaveBeenCalled();
    expect(mocks.span.end).toHaveBeenCalledTimes(1);
  });
});
