import { describe, expect, it, vi } from "vitest";
import {
  ABNORMAL_END_TOOL_FAILURE_SUMMARY,
  createAiStreamRuntime,
  shouldFailRunningToolsOnAbnormalEnd,
} from "@/lib/ai/ai-stream-runtime";
import type { TimelineItem } from "@/types/timeline";

describe("createAiStreamRuntime", () => {
  it("flags only abnormal failure terminal reasons for unfinished-tool cleanup", () => {
    expect(shouldFailRunningToolsOnAbnormalEnd("failed_network")).toBe(true);
    expect(shouldFailRunningToolsOnAbnormalEnd("failed_server")).toBe(true);
    expect(shouldFailRunningToolsOnAbnormalEnd("timed_out")).toBe(true);
    expect(shouldFailRunningToolsOnAbnormalEnd("cancelled_by_user")).toBe(false);
    expect(shouldFailRunningToolsOnAbnormalEnd("completed")).toBe(false);
    expect(ABNORMAL_END_TOOL_FAILURE_SUMMARY).toBe("Run ended before tool completion.");
  });

  it("appends structured error items for shared stream_error intents", () => {
    const timeline = new Map<string, TimelineItem[]>();
    const getItems = (conversationId: string) => timeline.get(conversationId) ?? [];

    const runtime = createAiStreamRuntime({
      aiMessageId: "ai-1",
      page: "overview",
      section: "protocol",
      initialConversationId: "conv-1",
      selectedProjectId: "project-1",
      myGen: 1,
      getCurrentGen: () => 1,
      updateConversationTimeline: (conversationId, updater) => {
        timeline.set(conversationId, updater(getItems(conversationId)));
      },
      ensureConversationTimeline: (conversationId) => {
        timeline.set(conversationId, getItems(conversationId));
      },
      setActiveConversationId: vi.fn(),
      upsertConversationTitle: vi.fn(),
      setPendingChoices: vi.fn(),
      setPendingUserInput: vi.fn(),
      onNavigate: vi.fn(),
    });

    runtime.handleChunk({
      type: "error",
      error: "The model returned invalid arguments for update_protocol.",
      errorMeta: {
        kind: "tool_call_parse",
        code: "TOOL_CALL_ARGS_PARSE_FAILED",
        retryable: false,
        source: "provider_tool_call",
        message: "The model returned invalid arguments for update_protocol.",
      },
    });

    expect(getItems("conv-1").at(-1)).toMatchObject({
      type: "error",
      message: "The model returned invalid arguments for update_protocol.",
      retryable: false,
      errorMeta: {
        code: "TOOL_CALL_ARGS_PARSE_FAILED",
        retryable: false,
      },
    });
  });

  it("collapses canonical fallback assistant text when deterministic capability errors arrive", () => {
    const timeline = new Map<string, TimelineItem[]>();
    const getItems = (conversationId: string) => timeline.get(conversationId) ?? [];
    timeline.set("conv-1", [
      {
        type: "assistant_message",
        id: "ai-1",
        content: "I couldn't complete that request: GPT-5.2 does not support an explicit reasoning budget.",
        createdAt: "2026-03-02T00:00:00.000Z",
      },
    ]);

    const runtime = createAiStreamRuntime({
      aiMessageId: "ai-1",
      page: "overview",
      section: "protocol",
      initialConversationId: "conv-1",
      selectedProjectId: "project-1",
      myGen: 1,
      getCurrentGen: () => 1,
      updateConversationTimeline: (conversationId, updater) => {
        timeline.set(conversationId, updater(getItems(conversationId)));
      },
      ensureConversationTimeline: (conversationId) => {
        timeline.set(conversationId, getItems(conversationId));
      },
      setActiveConversationId: vi.fn(),
      upsertConversationTitle: vi.fn(),
      setPendingChoices: vi.fn(),
      setPendingUserInput: vi.fn(),
      onNavigate: vi.fn(),
    });

    runtime.handleChunk({
      type: "error",
      error: "GPT-5.2 does not support an explicit reasoning budget.",
      errorMeta: {
        kind: "model_capability",
        code: "UNSUPPORTED_REASONING_CAPABILITY",
        retryable: false,
        source: "request_policy",
        message: "GPT-5.2 does not support an explicit reasoning budget.",
      },
    });

    const finalItems = getItems("conv-1");
    expect(finalItems).toHaveLength(1);
    expect(finalItems[0]).toMatchObject({
      type: "error",
      message: "GPT-5.2 does not support an explicit reasoning budget.",
      retryable: false,
    });
  });

  it("preserves semantic receipt fields when tool activity intents upsert the same call", () => {
    const timeline = new Map<string, TimelineItem[]>();
    const getItems = (conversationId: string) => timeline.get(conversationId) ?? [];

    const runtime = createAiStreamRuntime({
      aiMessageId: "ai-1",
      page: "overview",
      section: "protocol",
      initialConversationId: "conv-1",
      selectedProjectId: "project-1",
      myGen: 1,
      getCurrentGen: () => 1,
      updateConversationTimeline: (conversationId, updater) => {
        timeline.set(conversationId, updater(getItems(conversationId)));
      },
      ensureConversationTimeline: (conversationId) => {
        timeline.set(conversationId, getItems(conversationId));
      },
      setActiveConversationId: vi.fn(),
      upsertConversationTitle: vi.fn(),
      setPendingChoices: vi.fn(),
      setPendingUserInput: vi.fn(),
      onNavigate: vi.fn(),
    });

    runtime.handleChunk({
      type: "tool_call",
      toolCall: {
        id: "call-1",
        name: "delegate_search",
        arguments: { task: "Find recent omega-3 cognition trials" },
      },
    });

    runtime.handleChunk({
      type: "tool_result",
      toolName: "delegate_search",
      toolResult: {
        callId: "call-1",
        result: {
          success: true,
          summary: "Queued PubMed and OpenAlex searches and shortlisted 4 studies.",
          toolCallCount: 3,
          stopReason: "completed",
        },
      },
    });

    expect(getItems("conv-1")).toContainEqual(expect.objectContaining({
      type: "tool_activity",
      callId: "call-1",
      status: "done",
      displayLabel: "Delegated search",
      inputPreview: "Find recent omega-3 cognition trials",
      outcomeSummary: "Queued PubMed and OpenAlex searches and shortlisted 4 studies.",
      sourceBadge: "Search agent",
      detailItems: ["3 delegated tool calls", "Stop reason: completed"],
    }));
  });
});
