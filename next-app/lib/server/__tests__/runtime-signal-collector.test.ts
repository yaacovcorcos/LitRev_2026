import { describe, expect, it } from "vitest";
import { collectRuntimeSignals } from "@/lib/server/evals/runtime-signal-collector";

describe("runtime signal collector", () => {
  it("normalizes stream chunks into stable eval signals", () => {
    const signals = collectRuntimeSignals([
      { type: "run_start", runId: "run-1" },
      {
        type: "tool_result",
        toolResult: { callId: "late-tool", result: { source: "PubMed", returnedCount: 1 } },
      },
      {
        type: "tool_call",
        toolCall: { id: "tool-1", name: "search_pubmed", arguments: { query: "hypertension" } },
      },
      {
        type: "tool_result",
        toolResult: { callId: "tool-1", result: { source: "PubMed", returnedCount: 2 } },
      },
      {
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-1",
          question: "Continue?",
          questionType: "yes_no",
          decisionRequest: {
            id: "ask-1",
            callId: "ask-1",
            decisionBoundaryKey: "continue",
            decisionKind: "clarification",
            blockingLevel: "blocking",
            status: "pending",
            questions: [
              {
                questionId: "ask-1:question-1",
                prompt: "Continue?",
                responseKind: "yes_no",
                required: true,
                allowNote: true,
                allowOther: false,
                isSecret: false,
              },
            ],
          },
        },
      },
      { type: "run_end", runStatus: "paused", stopReason: "paused_for_input" },
    ], { page: "overview" });

    expect(signals).toEqual(expect.arrayContaining([
      "run_start",
      "tool_call:search_pubmed",
      "tool_result:search_pubmed",
      "tool_result:done",
      "tool_result:unknown",
      "user_input_required",
      "user_input_required:yes_no",
      "decision_request",
      "decision_request:pending",
      "run_end:paused",
      "stop_reason:paused_for_input",
    ]));
  });

  it("resolves tool result names from the whole replay when chunks arrive out of order", () => {
    const signals = collectRuntimeSignals([
      {
        type: "tool_result",
        toolResult: { callId: "late-tool", result: { source: "PubMed", returnedCount: 1 } },
      },
      {
        type: "tool_call",
        toolCall: { id: "late-tool", name: "search_pubmed", arguments: { query: "late result" } },
      },
    ], { page: "overview" });

    expect(signals).toEqual(expect.arrayContaining([
      "tool_result:search_pubmed",
      "tool_result:done",
    ]));
  });
});
