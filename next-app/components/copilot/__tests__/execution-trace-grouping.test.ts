import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/types/timeline";
import { buildExecutionTraceEntries } from "../execution-trace-grouping";

describe("buildExecutionTraceEntries", () => {
  it("groups contiguous durable trace items before a completed assistant answer and ignores progress for boundary detection", () => {
    const items: TimelineItem[] = [
      {
        type: "tool_activity",
        id: "tool-1",
        callId: "call-1",
        toolName: "search_pubmed",
        status: "done",
        startedAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:02.000Z",
        completedAt: "2026-03-11T00:00:02.000Z",
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "progress",
        id: "progress-1",
        message: "Reviewing PubMed results",
      },
      {
        type: "checkpoint",
        id: "checkpoint-1",
        label: "PubMed returned 10 results.",
        createdAt: "2026-03-11T00:00:03.000Z",
      },
      {
        type: "assistant_message",
        id: "assistant-1",
        content: "I found several strong studies.",
        createdAt: "2026-03-11T00:00:04.000Z",
      },
    ];

    const entries = buildExecutionTraceEntries(items);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "execution_trace",
      anchorAssistantMessageId: "assistant-1",
      canCollapse: true,
      defaultCollapsed: true,
      summaryText: "1 tool step, 1 checkpoint",
    });
    if (entries[0]?.kind !== "execution_trace") throw new Error("expected execution trace");
    expect(entries[0].traceItems).toHaveLength(2);
    expect(entries[0].interstitialProgressItems).toHaveLength(1);
    expect(entries[0].interstitialProgressItems[0]?.id).toBe("progress-1");
  });

  it("keeps streaming turns expanded by default", () => {
    const items: TimelineItem[] = [
      {
        type: "artifact",
        id: "artifact-1",
        artifactId: "artifact-1",
        artifactType: "protocol_suggestion",
        status: "proposed",
        title: "Protocol update",
        payload: {},
        version: 1,
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "assistant_message",
        id: "assistant-2",
        content: "Drafting the update...",
        createdAt: "2026-03-11T00:00:01.000Z",
      },
    ];

    const entries = buildExecutionTraceEntries(items, { streamingAssistantMessageId: "assistant-2" });
    if (entries[0]?.kind !== "execution_trace") throw new Error("expected execution trace");
    expect(entries[0].canCollapse).toBe(false);
    expect(entries[0].defaultCollapsed).toBe(false);
  });

  it("skips collapse when an answer is immediately followed by a blocking prompt", () => {
    const items: TimelineItem[] = [
      {
        type: "checkpoint",
        id: "checkpoint-2",
        label: "Need your choice.",
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "assistant_message",
        id: "assistant-3",
        content: "I need one more detail before I continue.",
        createdAt: "2026-03-11T00:00:01.000Z",
      },
      {
        type: "user_input_request",
        id: "ask-1",
        callId: "ask-call-1",
        question: "Which study should I inspect first?",
        questionType: "single_choice",
        answered: false,
        createdAt: "2026-03-11T00:00:02.000Z",
      },
    ];

    const entries = buildExecutionTraceEntries(items);
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.kind === "single")).toBe(true);
  });

  it("leaves artifacts after the final answer outside the collapsed trace", () => {
    const items: TimelineItem[] = [
      {
        type: "tool_activity",
        id: "tool-2",
        callId: "call-2",
        toolName: "search_openalex",
        status: "done",
        startedAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:01.000Z",
        completedAt: "2026-03-11T00:00:01.000Z",
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "assistant_message",
        id: "assistant-4",
        content: "Here is the summary.",
        createdAt: "2026-03-11T00:00:02.000Z",
      },
      {
        type: "artifact",
        id: "artifact-2",
        artifactId: "artifact-2",
        artifactType: "memory_proposal",
        status: "proposed",
        title: "Remember this preference",
        payload: {},
        version: 1,
        createdAt: "2026-03-11T00:00:03.000Z",
      },
    ];

    const entries = buildExecutionTraceEntries(items);
    expect(entries).toHaveLength(2);
    if (entries[0]?.kind !== "execution_trace") throw new Error("expected execution trace");
    expect(entries[0].traceItems).toHaveLength(1);
    expect(entries[1]).toMatchObject({
      kind: "single",
      item: expect.objectContaining({ id: "artifact-2", type: "artifact" }),
    });
  });
});
