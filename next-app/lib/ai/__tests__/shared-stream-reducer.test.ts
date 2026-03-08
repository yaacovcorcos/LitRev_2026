import { describe, expect, it } from "vitest";
import {
  createInitialSharedStreamState,
  reduceSharedStreamChunk,
} from "@/lib/ai/shared-stream-reducer";
import type { AIStreamChunk } from "@/types/ai";

const meta = { page: "ai" as const, section: "overview" };

describe("shared stream reducer", () => {
  it("handles all stream chunk types without throwing", () => {
    const chunks: AIStreamChunk[] = [
      { type: "content", content: "Hello" },
      { type: "reasoning_start", reasoningId: "r1" },
      { type: "reasoning_delta", reasoningId: "r1", reasoningText: "thinking" },
      { type: "reasoning_end", reasoningId: "r1" },
      { type: "tool_call", toolCall: { id: "tc1", name: "search", arguments: {} } },
      { type: "tool_result", toolName: "search", toolResult: { callId: "tc1", result: { ok: true } } },
      { type: "artifact", artifactId: "a1", artifactType: "plan", artifactStatus: "proposed", artifactTitle: "Plan" },
      { type: "progress", progressMessage: "Working", progressCurrent: 1, progressTotal: 2 },
      { type: "checkpoint", checkpointLabel: "checkpoint" },
      { type: "run_start", runId: "run1", conversationId: "conv1" },
      { type: "conversation_title", conversationTitle: "New title" },
      { type: "choices", choices: [{ label: "A", value: "a" }] },
      { type: "plan_step_update", planId: "plan-1", stepIndex: 0, stepStatus: "running" },
      { type: "navigate", navigateUrl: "/ai" },
      {
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-1",
          question: "Continue?",
          questionType: "yes_no",
        },
      },
      { type: "error", error: "boom" },
      { type: "run_end", runStatus: "completed" },
      { type: "done" },
    ];

    let state = createInitialSharedStreamState();
    for (const chunk of chunks) {
      const reduced = reduceSharedStreamChunk(state, chunk, meta);
      state = reduced.state;
      expect(Array.isArray(reduced.intents)).toBe(true);
    }
  });

  it("marks add_to_ledger tool results as ledger changes", () => {
    const start = createInitialSharedStreamState({ lastToolCallId: "tc-1" });
    const reduced = reduceSharedStreamChunk(
      start,
      {
        type: "tool_result",
        toolName: "add_to_ledger",
        toolResult: { callId: "tc-1", result: { ok: true } },
      },
      meta,
    );

    expect(reduced.intents.some((intent) => intent.type === "ledger_changed")).toBe(true);
  });

  it("emits synthetic tool ids when tool_call id is missing", () => {
    const reduced = reduceSharedStreamChunk(
      createInitialSharedStreamState(),
      {
        type: "tool_call",
        toolCall: { id: "", name: "search", arguments: {} },
      },
      meta,
    );

    const toolIntent = reduced.intents.find((intent) => intent.type === "tool_activity_upsert");
    expect(toolIntent && toolIntent.type === "tool_activity_upsert").toBe(true);
    if (!toolIntent || toolIntent.type !== "tool_activity_upsert") return;
    expect(toolIntent.callId.startsWith("synthetic-tool-")).toBe(true);
  });

  it("keeps user input context from reducer meta", () => {
    const reduced = reduceSharedStreamChunk(
      createInitialSharedStreamState(),
      {
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-2",
          question: "Pick one",
          questionType: "single_choice",
          options: [{ label: "One" }],
        },
      },
      { page: "draft", section: "intro" },
    );

    const appendIntent = reduced.intents.find((intent) => intent.type === "user_input_append");
    expect(appendIntent && appendIntent.type === "user_input_append").toBe(true);
    if (!appendIntent || appendIntent.type !== "user_input_append") return;
    expect(appendIntent.page).toBe("draft");
    expect(appendIntent.section).toBe("intro");
  });

  it("fails dangling running tool when run ends", () => {
    const reduced = reduceSharedStreamChunk(
      createInitialSharedStreamState({
        lastToolCallId: "tc-9",
        runningToolCallIds: ["tc-9"],
      }),
      { type: "run_end", runStatus: "failed" },
      meta,
    );

    expect(reduced.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run_set", runId: null }),
        expect.objectContaining({
          type: "tool_activity_upsert",
          callId: "tc-9",
          status: "failed",
        }),
      ]),
    );
    expect(reduced.state.runningToolCallIds).toEqual([]);
  });

  it("preserves structured error metadata on stream_error intents", () => {
    const reduced = reduceSharedStreamChunk(
      createInitialSharedStreamState(),
      {
        type: "error",
        error: "Validation failed.",
        errorMeta: {
          kind: "tool_schema_validation",
          code: "TOOL_VALIDATION_FAILED",
          retryable: false,
          source: "tool_validator",
          message: "Validation failed.",
        },
      },
      meta,
    );

    expect(reduced.intents).toContainEqual({
      type: "stream_error",
      message: "Validation failed.",
      errorMeta: {
        kind: "tool_schema_validation",
        code: "TOOL_VALIDATION_FAILED",
        retryable: false,
        source: "tool_validator",
        message: "Validation failed.",
      },
    });
  });

  it("fails all remaining running tools when calls interleave", () => {
    let state = createInitialSharedStreamState();

    state = reduceSharedStreamChunk(
      state,
      { type: "tool_call", toolCall: { id: "tc-A", name: "toolA", arguments: {} } },
      meta,
    ).state;

    state = reduceSharedStreamChunk(
      state,
      { type: "tool_call", toolCall: { id: "tc-B", name: "toolB", arguments: {} } },
      meta,
    ).state;

    state = reduceSharedStreamChunk(
      state,
      { type: "tool_result", toolName: "toolB", toolResult: { callId: "tc-B", result: { ok: true } } },
      meta,
    ).state;

    const runEnd = reduceSharedStreamChunk(
      state,
      { type: "run_end", runStatus: "failed" },
      meta,
    );

    const failedToolIds = runEnd.intents.reduce<string[]>((ids, intent) => {
      if (intent.type === "tool_activity_upsert" && intent.status === "failed") {
        ids.push(intent.callId);
      }
      return ids;
    }, []);

    expect(failedToolIds).toContain("tc-A");
    expect(failedToolIds).not.toContain("tc-B");
    expect(runEnd.state.runningToolCallIds).toEqual([]);
  });
});
