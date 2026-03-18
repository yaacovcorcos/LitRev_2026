import { describe, expect, it } from "vitest";
import {
  appendPopupUserMessage,
  createInitialPopupStreamRuntimeState,
  getPopupTranscriptEntries,
  reducePopupStreamChunk,
} from "@/lib/ai/popup-stream-runtime";
import { CHAT_STREAM_FIXTURES_V1 } from "@/lib/ai/stream-fixtures";

describe("popup stream runtime", () => {
  it("keeps the popup contract to the supported trace subset", () => {
    const fixture = CHAT_STREAM_FIXTURES_V1.find((candidate) => candidate.id === "pubmed-refinement-trace");
    expect(fixture).toBeDefined();

    let state = createInitialPopupStreamRuntimeState();
    for (const chunk of fixture!.chunks) {
      state = reducePopupStreamChunk(state, chunk, {
        aiMessageId: "popup-ai",
        page: fixture!.page,
        section: fixture!.section,
        now: () => "2026-03-10T00:00:00.000Z",
      });
    }

    expect(state.items.map((item) => item.type)).toEqual([
      "progress",
      "checkpoint",
      "checkpoint",
      "checkpoint",
      "user_input_request",
    ]);
    expect(state.items.find((item) => item.type === "user_input_request")).toMatchObject({
      question: "Which of these results should I inspect first?",
    });
  });

  it("builds a Continue in Copilot transcript from supported popup items", () => {
    let state = createInitialPopupStreamRuntimeState();
    state = appendPopupUserMessage(state, {
      id: "user-1",
      content: "Can you inspect these studies?",
      createdAt: "2026-03-10T00:00:00.000Z",
    });
    state = reducePopupStreamChunk(state, {
      type: "checkpoint",
      checkpointLabel: "PubMed returned 18 results. Reviewing the strongest matches now.",
    }, {
      aiMessageId: "popup-ai",
      page: "overview",
      now: () => "2026-03-10T00:00:01.000Z",
    });
    state = reducePopupStreamChunk(state, {
      type: "user_input_required",
      userInputRequest: {
        callId: "ask-1",
        question: "Which of these results should I inspect first?",
        questionType: "single_choice",
      },
    }, {
      aiMessageId: "popup-ai",
      page: "overview",
      now: () => "2026-03-10T00:00:02.000Z",
    });

    expect(getPopupTranscriptEntries(state.items)).toEqual([
      { role: "user", content: "Can you inspect these studies?" },
      { role: "assistant", content: "PubMed returned 18 results. Reviewing the strongest matches now." },
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
