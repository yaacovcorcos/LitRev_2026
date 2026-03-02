import { describe, expect, it, vi } from "vitest";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { ArtifactData } from "@/types/artifacts";
import { handleProjectCopilotStreamChunk, type StreamMutableState } from "@/contexts/project-copilot-stream-events";

describe("project copilot stream event handlers", () => {
  function baseState(): StreamMutableState {
    return {
      aiMessageCreated: false,
      fullContent: "",
      reasoningContent: "",
      reasoningState: "done",
      reasoningTruncated: false,
      activeReasoningId: null,
      runningToolCallIds: [],
      lastToolCallId: null,
      syntheticToolCounter: 0,
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
      setPendingUserInput: vi.fn(),
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
        setPendingUserInput: vi.fn(),
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
        setPendingUserInput: vi.fn(),
      }
    );

    expect(setPendingChoices).not.toHaveBeenCalled();
  });

  it("calls onNavigate for safe URLs and ignores unsafe ones", () => {
    const onNavigate = vi.fn();
    const deps = {
      aiMessageId: "m-1",
      page: "overview" as const,
      section: undefined,
      projectId: "p-1",
      myGen: 1,
      getCurrentGen: () => 1,
      setCurrentRunId: vi.fn(),
      syncConversationId: vi.fn(),
      upsertConversationTitle: vi.fn(),
      upsertArtifact: vi.fn(),
      updateMessages: vi.fn(),
      emitLedgerChanged: vi.fn(),
      setPendingChoices: vi.fn(),
      onPlanStepUpdate: vi.fn(),
      onNavigate,
      setPendingUserInput: vi.fn(),
    };

    // Safe URL → calls onNavigate
    handleProjectCopilotStreamChunk(
      { type: "navigate", navigateUrl: "/project/abc-123" },
      baseState(),
      deps
    );
    expect(onNavigate).toHaveBeenCalledWith("/project/abc-123");

    onNavigate.mockClear();

    // Unsafe URL → does NOT call onNavigate
    handleProjectCopilotStreamChunk(
      { type: "navigate", navigateUrl: "https://evil.com" },
      baseState(),
      deps
    );
    expect(onNavigate).not.toHaveBeenCalled();

    // Empty URL → does NOT call onNavigate
    handleProjectCopilotStreamChunk(
      { type: "navigate", navigateUrl: "" },
      baseState(),
      deps
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("accumulates reasoning chunks on the assistant message", () => {
    const messages: CopilotMessage[] = [];

    const deps = {
      aiMessageId: "m-1",
      page: "overview" as const,
      section: undefined,
      projectId: "p-1",
      myGen: 1,
      getCurrentGen: () => 1,
      setCurrentRunId: vi.fn(),
      syncConversationId: vi.fn(),
      upsertConversationTitle: vi.fn(),
      upsertArtifact: vi.fn(),
      updateMessages: (updater: (messages: CopilotMessage[]) => CopilotMessage[]) => {
        const next = updater(messages);
        messages.splice(0, messages.length, ...next);
      },
      emitLedgerChanged: vi.fn(),
      setPendingChoices: vi.fn(),
      onPlanStepUpdate: vi.fn(),
      setPendingUserInput: vi.fn(),
    };

    let nextState = handleProjectCopilotStreamChunk(
      { type: "reasoning_start", reasoningId: "r-1" },
      baseState(),
      deps
    );
    nextState = handleProjectCopilotStreamChunk(
      { type: "reasoning_delta", reasoningId: "r-1", reasoningText: "Inspecting the request..." },
      nextState,
      deps
    );
    nextState = handleProjectCopilotStreamChunk(
      { type: "reasoning_end", reasoningId: "r-1" },
      nextState,
      deps
    );
    nextState = handleProjectCopilotStreamChunk(
      { type: "content", content: "Final answer." },
      nextState,
      deps
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe("Final answer.");
    expect(messages[0]?.reasoning?.text).toBe("Inspecting the request...");
    expect(messages[0]?.reasoning?.state).toBe("done");
    expect(nextState.reasoningContent).toBe("Inspecting the request...");
    expect(nextState.activeReasoningId).toBeNull();
  });

  it("creates and completes typed tool activity entries", () => {
    const messages: CopilotMessage[] = [];
    const deps = {
      aiMessageId: "m-1",
      page: "overview" as const,
      section: undefined,
      projectId: "p-1",
      myGen: 1,
      getCurrentGen: () => 1,
      setCurrentRunId: vi.fn(),
      syncConversationId: vi.fn(),
      upsertConversationTitle: vi.fn(),
      upsertArtifact: vi.fn(),
      updateMessages: (updater: (msgs: CopilotMessage[]) => CopilotMessage[]) => {
        const next = updater(messages);
        messages.splice(0, messages.length, ...next);
      },
      emitLedgerChanged: vi.fn(),
      setPendingChoices: vi.fn(),
      onPlanStepUpdate: vi.fn(),
      setPendingUserInput: vi.fn(),
    };

    let state = handleProjectCopilotStreamChunk(
      { type: "tool_call", toolCall: { id: "tc-1", name: "search_openalex", arguments: {} } },
      baseState(),
      deps
    );
    state = handleProjectCopilotStreamChunk(
      { type: "tool_result", toolResult: { callId: "tc-1", result: { ok: true } }, toolName: "search_openalex" },
      state,
      deps
    );

    const toolMessage = messages.find((m) => m.id === "tool-tc-1");
    expect(toolMessage?.toolActivity?.status).toBe("done");
    expect(toolMessage?.toolActivity?.toolName).toBe("search_openalex");
  });

  it("materializes user_input_required into a timeline-compatible message", () => {
    const messages: CopilotMessage[] = [];
    const setPendingUserInput = vi.fn();
    const deps = {
      aiMessageId: "m-1",
      page: "overview" as const,
      section: undefined,
      projectId: "p-1",
      myGen: 1,
      getCurrentGen: () => 1,
      setCurrentRunId: vi.fn(),
      syncConversationId: vi.fn(),
      upsertConversationTitle: vi.fn(),
      upsertArtifact: vi.fn(),
      updateMessages: (updater: (msgs: CopilotMessage[]) => CopilotMessage[]) => {
        const next = updater(messages);
        messages.splice(0, messages.length, ...next);
      },
      emitLedgerChanged: vi.fn(),
      setPendingChoices: vi.fn(),
      onPlanStepUpdate: vi.fn(),
      setPendingUserInput,
    };

    handleProjectCopilotStreamChunk(
      {
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-1",
          question: "Continue?",
          questionType: "yes_no",
        },
      },
      baseState(),
      deps
    );

    expect(setPendingUserInput).toHaveBeenCalledTimes(1);
    const askMessage = messages.find((m) => m.id === "user-input-ask-1");
    expect(askMessage?.userInputRequest?.question).toBe("Continue?");
    expect(askMessage?.userInputRequest?.answered).toBe(false);
  });
});
