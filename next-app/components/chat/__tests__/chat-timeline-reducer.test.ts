import { describe, expect, it } from "vitest";
import type { ProjectConversationMessage } from "@/lib/project-conversation-storage";
import { messagesToTimeline, reduceStreamChunk } from "../chat-timeline-reducer";

describe("messagesToTimeline", () => {
  it("maps recoverable assistant stream failures to timeline error items", () => {
    const messages: ProjectConversationMessage[] = [
      {
        id: "u1",
        sender: "user",
        text: "Run the plan",
        createdAt: "2026-02-28T00:00:00.000Z",
      },
      {
        id: "a1",
        sender: "ai",
        text: "Sorry, I encountered an error: Tool call failed. Please try again.",
        createdAt: "2026-02-28T00:00:01.000Z",
      },
    ];

    const timeline = messagesToTimeline(messages);
    expect(timeline[1]).toMatchObject({
      type: "error",
      id: "error-a1",
      message: "Tool call failed",
      retryable: true,
    });
  });

  it("maps plan execution failures to timeline error items", () => {
    const messages: ProjectConversationMessage[] = [
      {
        id: "a2",
        sender: "ai",
        text: "Plan execution failed: Step 2 could not complete.",
        createdAt: "2026-02-28T00:00:02.000Z",
      },
    ];

    const timeline = messagesToTimeline(messages);
    expect(timeline[0]).toMatchObject({
      type: "error",
      id: "error-a2",
      message: "Step 2 could not complete.",
      retryable: false,
    });
  });

  it("maps structured user input and tool activity messages to typed timeline items", () => {
    const messages: ProjectConversationMessage[] = [
      {
        id: "ask-1",
        sender: "ai",
        text: "",
        createdAt: "2026-02-28T00:00:03.000Z",
        userInputRequest: {
          callId: "ask-call-1",
          questionId: "ask-call-1:question-1",
          question: "Continue with strict mode?",
          questionType: "yes_no",
          answered: false,
        },
      },
      {
        id: "tool-1",
        sender: "ai",
        text: "",
        createdAt: "2026-02-28T00:00:04.000Z",
        toolActivity: {
          callId: "tc-1",
          toolName: "search_openalex",
          status: "running",
          displayLabel: "Searching OpenAlex",
          inputPreview: "\"retrospective cohort\" AND disposition decision",
          sourceBadge: "OpenAlex",
          detailItems: ["10 of 18 results"],
          queryPreview: "\"retrospective cohort\" AND disposition decision",
          returnedCount: 10,
          totalResults: 18,
          resultIdentifiers: ["DOI 10.1000/example", "OpenAlex W123"],
          startedAt: "2026-02-28T00:00:04.000Z",
          updatedAt: "2026-02-28T00:00:04.000Z",
        },
      },
    ];

    const timeline = messagesToTimeline(messages);
    expect(timeline[0]).toMatchObject({
      type: "user_input_request",
      callId: "ask-call-1",
      questionId: "ask-call-1:question-1",
      question: "Continue with strict mode?",
      answered: false,
    });
    expect(timeline[1]).toMatchObject({
      type: "tool_activity",
      callId: "tc-1",
      toolName: "search_openalex",
      status: "running",
      displayLabel: "Searching OpenAlex",
      inputPreview: "\"retrospective cohort\" AND disposition decision",
      sourceBadge: "OpenAlex",
      detailItems: ["10 of 18 results"],
      queryPreview: "\"retrospective cohort\" AND disposition decision",
      returnedCount: 10,
      totalResults: 18,
      resultIdentifiers: ["DOI 10.1000/example", "OpenAlex W123"],
    });
  });

  it("maps structured progress messages to timeline progress items", () => {
    const messages: ProjectConversationMessage[] = [
      {
        id: "progress-current",
        sender: "ai",
        text: "",
        createdAt: "2026-02-28T00:00:04.000Z",
        progress: {
          message: "Searching PubMed",
          current: 1,
          total: 3,
        },
      },
    ];

    const timeline = messagesToTimeline(messages);
    expect(timeline[0]).toMatchObject({
      type: "progress",
      id: "progress-current",
      message: "Searching PubMed",
      current: 1,
      total: 3,
    });
  });

  it("maps structured checkpoint messages to timeline checkpoint items", () => {
    const messages: ProjectConversationMessage[] = [
      {
        id: "checkpoint-current",
        sender: "ai",
        text: "",
        createdAt: "2026-02-28T00:00:05.000Z",
        checkpoint: {
          label: "PubMed found 18 total results. Reviewing the strongest matches now.",
        },
      },
    ];

    const timeline = messagesToTimeline(messages);
    expect(timeline[0]).toMatchObject({
      type: "checkpoint",
      id: "checkpoint-current",
      label: "PubMed found 18 total results. Reviewing the strongest matches now.",
    });
  });

  it("maps structured persisted stream errors without forcing retryable=true", () => {
    const messages: ProjectConversationMessage[] = [
      {
        id: "err-structured",
        sender: "ai",
        text: "The model returned invalid arguments for update_protocol.",
        createdAt: "2026-02-28T00:00:05.000Z",
        streamError: {
          kind: "tool_call_parse",
          code: "TOOL_CALL_ARGS_PARSE_FAILED",
          retryable: false,
          source: "provider_tool_call",
          message: "The model returned invalid arguments for update_protocol.",
        },
      },
    ];

    const timeline = messagesToTimeline(messages);
    expect(timeline[0]).toMatchObject({
      type: "error",
      message: "The model returned invalid arguments for update_protocol.",
      retryable: false,
      errorMeta: {
        code: "TOOL_CALL_ARGS_PARSE_FAILED",
      },
    });
  });

  it("preserves structured retryability on streamed error chunks", () => {
    const timeline = reduceStreamChunk([], {
      type: "error",
      error: "The model returned invalid arguments for update_protocol.",
      errorMeta: {
        kind: "tool_call_parse",
        code: "TOOL_CALL_ARGS_PARSE_FAILED",
        retryable: false,
        source: "provider_tool_call",
        message: "The model returned invalid arguments for update_protocol.",
      },
    }, "ai-1");

    expect(timeline[0]).toMatchObject({
      type: "error",
      retryable: false,
      errorMeta: {
        kind: "tool_call_parse",
      },
    });
  });

  it("does not default direct streamed errors to retryable when metadata is absent", () => {
    const timeline = reduceStreamChunk([], {
      type: "error",
      error: "Validation failed for update_protocol.",
    }, "ai-2");

    expect(timeline[0]).toMatchObject({
      type: "error",
      message: "Validation failed for update_protocol.",
      retryable: false,
      errorMeta: {
        code: "CLIENT_STREAM_ERROR",
        retryable: false,
      },
    });
  });

  it("preserves questionId on streamed user_input_required chunks", () => {
    const timeline = reduceStreamChunk([], {
      type: "user_input_required",
      userInputRequest: {
        callId: "ask-call-2",
        questionId: "ask-call-2:question-1",
        question: "Do you want me to keep going?",
        questionType: "yes_no",
      },
    }, "ai-3");

    expect(timeline[0]).toMatchObject({
      type: "user_input_request",
      id: "user-input-ask-call-2",
      callId: "ask-call-2",
      questionId: "ask-call-2:question-1",
      question: "Do you want me to keep going?",
      answered: false,
    });
  });
});
