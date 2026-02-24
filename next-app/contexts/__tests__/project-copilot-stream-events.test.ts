import { describe, expect, it, vi } from "vitest";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { ArtifactData } from "@/types/artifacts";
import { handleProjectCopilotStreamChunk, type StreamMutableState } from "@/contexts/project-copilot-stream-events";

describe("project copilot stream event handlers", () => {
  function baseState(): StreamMutableState {
    return {
      aiMessageCreated: false,
      fullContent: "",
      localRunId: "",
      effectiveConvId: null,
    };
  }

  it("creates and updates assistant message for content chunks", () => {
    const messages: CopilotMessage[] = [];
    const artifacts = new Map<string, ArtifactData>();
    let pendingChoices: unknown[] = [];
    let runId: string | null = null;

    const deps = {
      aiMessageId: "m-1",
      page: "overview" as const,
      section: undefined,
      projectId: "p-1",
      myGen: 1,
      getCurrentGen: () => 1,
      setCurrentRunId: (id: string | null) => {
        runId = id;
      },
      syncConversationId: vi.fn(),
      upsertConversationTitle: vi.fn(),
      upsertArtifact: (artifact: ArtifactData) => {
        artifacts.set(artifact.id, artifact);
      },
      updateMessages: (updater: (messages: CopilotMessage[]) => CopilotMessage[]) => {
        const next = updater(messages);
        messages.splice(0, messages.length, ...next);
      },
      emitLedgerChanged: vi.fn(),
      setPendingChoices: (choices: unknown[]) => {
        pendingChoices = choices;
      },
      onPlanStepUpdate: vi.fn(),
    };

    let nextState = handleProjectCopilotStreamChunk(
      { type: "content", content: "Hello" },
      baseState(),
      deps
    );
    nextState = handleProjectCopilotStreamChunk(
      { type: "content", content: " world" },
      nextState,
      deps
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe("Hello world");
    expect(nextState.fullContent).toBe("Hello world");
    expect(runId).toBeNull();
    expect(artifacts.size).toBe(0);
    expect(pendingChoices).toEqual([]);
  });

  it("updates run and conversation identity on run_start", () => {
    const setCurrentRunId = vi.fn();
    const syncConversationId = vi.fn();
    const nextState = handleProjectCopilotStreamChunk(
      { type: "run_start", runId: "run-1", conversationId: "conv-1" },
      baseState(),
      {
        aiMessageId: "m-1",
        page: "overview",
        section: undefined,
        projectId: "p-1",
        myGen: 1,
        getCurrentGen: () => 1,
        setCurrentRunId,
        syncConversationId,
        upsertConversationTitle: vi.fn(),
        upsertArtifact: vi.fn(),
        updateMessages: vi.fn(),
        emitLedgerChanged: vi.fn(),
        setPendingChoices: vi.fn(),
        onPlanStepUpdate: vi.fn(),
      }
    );

    expect(setCurrentRunId).toHaveBeenCalledWith("run-1");
    expect(syncConversationId).toHaveBeenCalledWith("conv-1");
    expect(nextState.localRunId).toBe("run-1");
    expect(nextState.effectiveConvId).toBe("conv-1");
  });

  it("applies choice chips only for active stream generation", () => {
    const setPendingChoices = vi.fn();
    handleProjectCopilotStreamChunk(
      { type: "choices", choices: [{ label: "A", value: "a" }] },
      baseState(),
      {
        aiMessageId: "m-1",
        page: "overview",
        section: undefined,
        projectId: "p-1",
        myGen: 2,
        getCurrentGen: () => 1,
        setCurrentRunId: vi.fn(),
        syncConversationId: vi.fn(),
        upsertConversationTitle: vi.fn(),
        upsertArtifact: vi.fn(),
        updateMessages: vi.fn(),
        emitLedgerChanged: vi.fn(),
        setPendingChoices,
        onPlanStepUpdate: vi.fn(),
      }
    );

    expect(setPendingChoices).not.toHaveBeenCalled();
  });
});

