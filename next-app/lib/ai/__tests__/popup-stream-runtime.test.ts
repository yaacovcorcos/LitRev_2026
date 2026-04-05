import { describe, expect, it } from "vitest";
import {
  appendPopupUserMessage,
  createInitialPopupStreamRuntimeState,
  createPopupStreamRuntimeController,
  getPopupTranscriptEntries,
} from "@/lib/ai/popup-stream-runtime";
import { CHAT_STREAM_FIXTURES_V1 } from "@/lib/ai/stream-fixtures";
import { createInitialSharedStreamState, reduceSharedStreamChunk } from "@/lib/ai/shared-stream-reducer";

describe("popup stream runtime", () => {
  it("keeps popup on the shared runtime state machine while projecting a reduced popup subset", () => {
    const fixture = CHAT_STREAM_FIXTURES_V1.find((candidate) => candidate.id === "pubmed-refinement-trace");
    expect(fixture).toBeDefined();

    let reducerState = createInitialSharedStreamState();
    const controller = createPopupStreamRuntimeController({
      aiMessageId: "popup-ai",
      page: fixture!.page,
      section: fixture!.section,
      now: () => "2026-03-10T00:00:00.000Z",
      myGen: 1,
      getCurrentGen: () => 1,
    });

    for (const chunk of fixture!.chunks) {
      reducerState = reduceSharedStreamChunk(reducerState, chunk, {
        page: fixture!.page,
        section: fixture!.section,
      }).state;
      controller.handleChunk(chunk);
      expect(controller.getState().sharedState).toEqual(reducerState);
    }

    expect(controller.getState().items.map((item) => item.type)).toEqual([
      "tool_activity",
      "progress",
      "checkpoint",
      "tool_activity",
      "checkpoint",
      "checkpoint",
      "user_input_request",
    ]);
    expect(controller.getState().items.find((item) => item.type === "user_input_request")).toMatchObject({
      question: "Which of these results should I inspect first?",
    });
  });

  it("projects settled semantic receipts into the popup-visible trace and transcript", () => {
    const controller = createPopupStreamRuntimeController({
      aiMessageId: "popup-ai",
      page: "overview",
      now: () => "2026-03-10T00:00:00.000Z",
      myGen: 1,
      getCurrentGen: () => 1,
    });

    controller.handleChunk({
      type: "tool_call",
      toolCall: { id: "read-protocol-1", name: "read_protocol", arguments: {} },
    });
    controller.handleChunk({
      type: "tool_result",
      toolName: "read_protocol",
      toolResult: {
        callId: "read-protocol-1",
        result: {
          hasProtocol: false,
          protocolContext: "[PROTOCOL_CONTEXT]\nNo protocol defined yet.",
          protocol: {},
        },
      },
    });

    expect(controller.getState().items).toContainEqual(expect.objectContaining({
      type: "tool_activity",
      callId: "read-protocol-1",
      status: "done",
      displayLabel: "Read protocol",
      outcomeSummary: "No protocol is defined yet.",
      sourceBadge: "Protocol",
    }));

    expect(getPopupTranscriptEntries(controller.getState().items)).toEqual([
      {
        role: "assistant",
        content: "Read protocol\nNo protocol is defined yet.",
      },
    ]);
  });

  it("builds a Continue in Copilot transcript from the popup-visible subset", () => {
    let state = createInitialPopupStreamRuntimeState();
    state = appendPopupUserMessage(state, {
      id: "user-1",
      content: "Can you inspect these studies?",
      createdAt: "2026-03-10T00:00:00.000Z",
    });

    const controller = createPopupStreamRuntimeController({
      initialState: state,
      aiMessageId: "popup-ai",
      page: "overview",
      now: () => "2026-03-10T00:00:01.000Z",
      myGen: 1,
      getCurrentGen: () => 1,
    });

    controller.handleChunk({
      type: "tool_call",
      toolCall: {
        id: "inspect-memory-1",
        name: "inspect_memory",
        arguments: { query: "study methods" },
      },
    });
    controller.handleChunk({
      type: "tool_result",
      toolName: "inspect_memory",
      toolResult: {
        callId: "inspect-memory-1",
        result: {
          summary: "Found 2 active memories.",
          memories: [
            { id: "m1", memoryType: "project", key: "protocol_decision", value: "..." },
            { id: "m2", memoryType: "study", key: "study_methods", value: "..." },
          ],
        },
      },
    });
    controller.handleChunk({
      type: "user_input_required",
      userInputRequest: {
        callId: "ask-1",
        question: "Which of these results should I inspect first?",
        questionType: "single_choice",
      },
    });

    expect(getPopupTranscriptEntries(controller.getState().items)).toEqual([
      { role: "user", content: "Can you inspect these studies?" },
      { role: "assistant", content: "Checked memory\nFound 2 active memories.\nprotocol_decision; study_methods" },
      { role: "assistant", content: "Need your answer before continuing: Which of these results should I inspect first?" },
      { role: "assistant", content: "Which of these results should I inspect first?" },
    ]);
  });

  it("normalizes assistant transcript entries before popup handoff/export flows", () => {
    const entries = getPopupTranscriptEntries([
      {
        type: "assistant_message",
        id: "assistant-1",
        createdAt: "2026-03-10T00:00:00.000Z",
        content: 'Visible narrative\n\n<!-- MENTIONED_STUDIES: {"studies":[{"title":"Study","doi":"10.1000/x"}]} -->',
      },
    ]);

    expect(entries).toEqual([
      { role: "assistant", content: "Visible narrative" },
    ]);
  });
});
