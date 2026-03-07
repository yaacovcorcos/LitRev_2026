import { describe, expect, it, vi } from "vitest";
import { createAiStreamRuntime } from "@/lib/ai/ai-stream-runtime";
import type { TimelineItem } from "@/types/timeline";

describe("createAiStreamRuntime", () => {
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
});
