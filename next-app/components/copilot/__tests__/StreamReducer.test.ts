import { describe, expect, it } from "vitest";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import { messagesToTimeline } from "../StreamReducer";

describe("messagesToTimeline", () => {
  it("maps recoverable assistant stream failures to timeline error items", () => {
    const messages: CopilotMessage[] = [
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
    const messages: CopilotMessage[] = [
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
      retryable: true,
    });
  });

  it("maps structured user input and tool activity messages to typed timeline items", () => {
    const messages: CopilotMessage[] = [
      {
        id: "ask-1",
        sender: "ai",
        text: "",
        createdAt: "2026-02-28T00:00:03.000Z",
        userInputRequest: {
          callId: "ask-call-1",
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
          startedAt: "2026-02-28T00:00:04.000Z",
          updatedAt: "2026-02-28T00:00:04.000Z",
        },
      },
    ];

    const timeline = messagesToTimeline(messages);
    expect(timeline[0]).toMatchObject({
      type: "user_input_request",
      callId: "ask-call-1",
      question: "Continue with strict mode?",
      answered: false,
    });
    expect(timeline[1]).toMatchObject({
      type: "tool_activity",
      callId: "tc-1",
      toolName: "search_openalex",
      status: "running",
    });
  });
});
