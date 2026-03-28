import { describe, expect, it, vi } from "vitest";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import { selectActiveProgress, normalizeTimelineProgressItems } from "@/lib/ai/active-progress";
import type { ArtifactData } from "@/types/artifacts";
import { messagesToTimeline } from "@/components/copilot/StreamReducer";
import {
  failRunningProjectToolActivityMessages,
  handleProjectCopilotStreamChunk,
  reserveProjectCopilotAssistantTurn,
  type StreamMutableState,
} from "@/contexts/project-copilot-stream-events";

describe("project copilot stream event handlers", () => {
  function baseState(): StreamMutableState {
    return {
      aiMessageCreated: false,
      hasVisibleContent: false,
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
      completedPubmedSearchCount: 0,
      lastPubmedSearchSize: null,
    };
  }

  it("fails running tool activity messages with the shared abnormal-end summary", () => {
    const messages: CopilotMessage[] = [
      {
        id: "tool-1",
        sender: "ai",
        text: "",
        createdAt: "2026-03-08T00:00:00.000Z",
        context: { page: "overview" },
        toolActivity: {
          callId: "call-1",
          toolName: "bulk_screening",
          status: "running",
          startedAt: "2026-03-08T00:00:00.000Z",
          updatedAt: "2026-03-08T00:00:00.000Z",
        },
      },
      {
        id: "tool-2",
        sender: "ai",
        text: "",
        createdAt: "2026-03-08T00:00:00.000Z",
        context: { page: "overview" },
        toolActivity: {
          callId: "call-2",
          toolName: "read_protocol",
          status: "done",
          startedAt: "2026-03-08T00:00:00.000Z",
          updatedAt: "2026-03-08T00:00:00.000Z",
          completedAt: "2026-03-08T00:01:00.000Z",
        },
      },
    ];

    const next = failRunningProjectToolActivityMessages(messages);
    expect(next[0]?.toolActivity).toMatchObject({
      status: "failed",
      summary: "Run ended before tool completion.",
    });
    expect(next[0]?.toolActivity?.completedAt).toBeTruthy();
    expect(next[1]?.toolActivity).toMatchObject({
      status: "done",
      completedAt: "2026-03-08T00:01:00.000Z",
    });
  });

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

  it("stores progress as structured state instead of assistant transcript text and clears it", () => {
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
      { type: "progress", progressMessage: "Searching PubMed", progressCurrent: 1, progressTotal: 3 },
      baseState(),
      deps,
    );

    expect(state.fullContent).toBe("");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "progress-1",
      sender: "ai",
      text: "",
      progress: {
        message: "Searching PubMed",
        current: 1,
        total: 3,
      },
    });

    state = handleProjectCopilotStreamChunk(
      { type: "progress", progressMessage: "Analyzing search results", progressCurrent: 2, progressTotal: 3 },
      state,
      deps,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.progress).toMatchObject({
      message: "Analyzing search results",
      current: 2,
      total: 3,
    });

    state = handleProjectCopilotStreamChunk(
      { type: "content", content: "Found relevant studies." },
      state,
      deps,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "m-1",
      sender: "ai",
      text: "Found relevant studies.",
    });
    expect(messages[0]?.progress).toBeUndefined();
    expect(state.fullContent).toBe("Found relevant studies.");
  });

  it("moves the reserved assistant behind live trace messages and reuses that row for the final answer", () => {
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

    let state = reserveProjectCopilotAssistantTurn(baseState(), deps);
    state = handleProjectCopilotStreamChunk(
      { type: "checkpoint", checkpointLabel: "PubMed returned 18 results." },
      state,
      deps,
    );

    expect(messages.map((message) => message.id)).toEqual([
      expect.stringMatching(/^checkpoint-/),
      "m-1",
    ]);
    expect(messages.filter((message) => message.id === "m-1")).toHaveLength(1);

    handleProjectCopilotStreamChunk(
      { type: "content", content: "I found the strongest matches." },
      state,
      deps,
    );

    expect(messages.map((message) => message.id)).toEqual([
      expect.stringMatching(/^checkpoint-/),
      "m-1",
    ]);
    expect(messages.filter((message) => message.id === "m-1")).toHaveLength(1);
    expect(messages[1]).toMatchObject({
      id: "m-1",
      sender: "ai",
      text: "I found the strongest matches.",
      deliveryState: undefined,
    });
  });

  it("stores checkpoint intents as structured project messages", () => {
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

    handleProjectCopilotStreamChunk(
      { type: "checkpoint", checkpointLabel: "PubMed returned 18 results. Reviewing the strongest matches now." },
      baseState(),
      deps,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      sender: "ai",
      text: "",
      checkpoint: {
        label: "PubMed returned 18 results. Reviewing the strongest matches now.",
      },
    });
  });

  it("updates a pending ask_user card when a structured resolution is replayed", () => {
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

    const state = handleProjectCopilotStreamChunk(
      {
        type: "user_input_required",
        userInputRequest: {
          sourceRunId: "run-paused",
          callId: "ask-1",
          question: "Which direction should I take?",
          questionType: "single_choice",
        },
      },
      baseState(),
      deps,
    );

    handleProjectCopilotStreamChunk(
      {
        type: "user_input_resolved",
        userInputResolution: {
          sourceRunId: "run-paused",
          callId: "ask-1",
          resolution: "cancelled",
          answerText: "Cancelled by the user.",
          answeredAt: "2026-03-24T10:00:00.000Z",
        },
      },
      state,
      deps,
    );

    expect(messages).toHaveLength(2);
    expect(messages.find((message) => message.userInputRequest?.callId === "ask-1")?.userInputRequest).toMatchObject({
      callId: "ask-1",
      resolution: "cancelled",
      answered: false,
      answer: "Cancelled by the user.",
    });
  });

  it("keeps cancelled clarification state visible after a terminal cancelled run_end", () => {
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
      {
        type: "user_input_required",
        userInputRequest: {
          sourceRunId: "run-paused",
          callId: "ask-1",
          question: "Which direction should I take?",
          questionType: "single_choice",
        },
      },
      baseState(),
      deps,
    );

    state = handleProjectCopilotStreamChunk(
      {
        type: "user_input_resolved",
        userInputResolution: {
          sourceRunId: "run-paused",
          callId: "ask-1",
          resolution: "cancelled",
          answerText: "Cancelled by the user.",
          answeredAt: "2026-03-24T10:00:00.000Z",
        },
      },
      state,
      deps,
    );

    handleProjectCopilotStreamChunk(
      {
        type: "run_end",
        runId: "run-paused",
        runStatus: "cancelled",
        stopReason: "cancelled",
      },
      state,
      deps,
    );

    const timeline = messagesToTimeline(messages);
    expect(timeline.find((item) => item.type === "user_input_request")).toMatchObject({
      resolution: "cancelled",
      answered: false,
      answer: "Cancelled by the user.",
    });
    expect(timeline.some((item) => item.type === "error")).toBe(false);
  });

  it("preserves a suppressible local progress id through the project bridge timeline conversion", () => {
    const messages: CopilotMessage[] = [];
    const deps = {
      aiMessageId: "m-1",
      page: "overview" as const,
      section: undefined,
      projectId: "p-1",
      myGen: 7,
      getCurrentGen: () => 7,
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

    handleProjectCopilotStreamChunk(
      { type: "progress", progressMessage: "Reviewing PubMed results", progressCurrent: 2, progressTotal: 3 },
      baseState(),
      deps,
    );

    const timeline = messagesToTimeline(messages);
    const { activeProgress, suppressedProgressId } = selectActiveProgress(normalizeTimelineProgressItems(timeline));

    expect(activeProgress).toMatchObject({
      id: "progress-7",
      message: "Reviewing PubMed results",
      current: 2,
      total: 3,
    });
    expect(suppressedProgressId).toBe("progress-7");
  });

  it("scopes progress to the active generation and replaces stale progress rows", () => {
    const messages: CopilotMessage[] = [
      {
        id: "progress-1",
        sender: "ai",
        text: "",
        createdAt: "2026-03-10T00:00:00.000Z",
        context: { page: "overview" },
        progress: {
          message: "Searching PubMed",
          current: 1,
          total: 3,
        },
      },
    ];

    const deps = {
      aiMessageId: "m-2",
      page: "overview" as const,
      section: undefined,
      projectId: "p-1",
      myGen: 2,
      getCurrentGen: () => 2,
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

    handleProjectCopilotStreamChunk(
      { type: "progress", progressMessage: "Analyzing search results", progressCurrent: 2, progressTotal: 3 },
      baseState(),
      deps,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "progress-2",
      progress: {
        message: "Analyzing search results",
        current: 2,
        total: 3,
      },
    });
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

    const state = handleProjectCopilotStreamChunk(
      {
        type: "tool_call",
        toolCall: {
          id: "tc-1",
          name: "search_openalex",
          arguments: { query: "\"retrospective cohort\" AND disposition decision" },
        },
      },
      baseState(),
      deps
    );
    handleProjectCopilotStreamChunk(
      {
        type: "tool_result",
        toolResult: {
          callId: "tc-1",
          result: {
            totalResults: 18,
            returnedCount: 5,
            results: [{ doi: "10.1000/example" }, { metadata: { openAlexId: "https://openalex.org/W123" } }],
          },
        },
        toolName: "search_openalex",
      },
      state,
      deps
    );

    const toolMessage = messages.find((m) => m.id === "tool-tc-1");
    expect(toolMessage?.toolActivity?.status).toBe("done");
    expect(toolMessage?.toolActivity?.toolName).toBe("search_openalex");
    expect(toolMessage?.toolActivity?.queryPreview).toBe("\"retrospective cohort\" AND disposition decision");
    expect(toolMessage?.toolActivity?.returnedCount).toBe(5);
    expect(toolMessage?.toolActivity?.totalResults).toBe(18);
    expect(toolMessage?.toolActivity?.resultIdentifiers).toEqual(["DOI 10.1000/example", "OpenAlex W123"]);
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

  it("appends structured stream errors from shared reducer intents", () => {
    const messages: CopilotMessage[] = [];
    const deps = {
      aiMessageId: "m-1",
      page: "overview" as const,
      section: "protocol",
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

    handleProjectCopilotStreamChunk(
      {
        type: "error",
        error: "The model returned invalid arguments for update_protocol.",
        errorMeta: {
          kind: "tool_call_parse",
          code: "TOOL_CALL_ARGS_PARSE_FAILED",
          retryable: false,
          source: "provider_tool_call",
          message: "The model returned invalid arguments for update_protocol.",
        },
      },
      baseState(),
      deps,
    );

    expect(messages.at(-1)).toMatchObject({
      sender: "ai",
      text: "The model returned invalid arguments for update_protocol.",
      context: { page: "overview", section: "protocol" },
      streamError: {
        code: "TOOL_CALL_ARGS_PARSE_FAILED",
        retryable: false,
      },
    });
  });

  it("removes canonical fallback assistant text when deterministic capability errors are emitted", () => {
    const messages: CopilotMessage[] = [{
      id: "m-1",
      sender: "ai",
      text: "I couldn't complete that request: GPT-5.2 does not support an explicit reasoning budget.",
      createdAt: "2026-03-02T00:00:00.000Z",
      context: { page: "overview" },
    }];
    const deps = {
      aiMessageId: "m-1",
      page: "overview" as const,
      section: "protocol",
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

    handleProjectCopilotStreamChunk(
      {
        type: "error",
        error: "GPT-5.2 does not support an explicit reasoning budget.",
        errorMeta: {
          kind: "model_capability",
          code: "UNSUPPORTED_REASONING_CAPABILITY",
          retryable: false,
          source: "request_policy",
          message: "GPT-5.2 does not support an explicit reasoning budget.",
        },
      },
      baseState(),
      deps,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      sender: "ai",
      text: "GPT-5.2 does not support an explicit reasoning budget.",
      streamError: {
        code: "UNSUPPORTED_REASONING_CAPABILITY",
        retryable: false,
      },
    });
  });
});
