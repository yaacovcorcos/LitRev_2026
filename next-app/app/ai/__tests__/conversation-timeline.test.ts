import { describe, expect, it } from "vitest";

import {
  mapDbMessagesToTimeline,
  markTimelineStoppedByUser,
  stripReservedAssistantTimelineItems,
} from "../conversation-timeline";

describe("conversation-timeline helpers", () => {
  it("maps stored messages and artifacts into timeline items sorted by creation time", () => {
    const timeline = mapDbMessagesToTimeline(
      [
        {
          id: "assistant-1",
          role: "assistant",
          content: "Assistant reply",
          createdAt: "2026-03-01T10:00:01.000Z",
        },
        {
          id: "user-1",
          role: "user",
          content: "User request",
          createdAt: "2026-03-01T10:00:00.000Z",
          attachments: [
            {
              fileAssetId: "file-1",
              filename: "paper.pdf",
              mimeType: "application/pdf",
              size: 128,
            },
          ],
        },
      ],
      [
        {
          id: "artifact-1",
          type: "draft_diff",
          status: "proposed",
          title: "Draft proposal",
          payload: { section: "Intro" },
          version: 1,
          createdAt: "2026-03-01T10:00:02.000Z",
        },
      ],
    );

    expect(timeline).toMatchObject([
      {
        type: "user_message",
        id: "user-1",
        content: "User request",
        attachments: [
          {
            fileAssetId: "file-1",
            filename: "paper.pdf",
            mimeType: "application/pdf",
            size: 128,
          },
        ],
      },
      {
        type: "assistant_message",
        id: "assistant-1",
        content: "Assistant reply",
      },
      {
        type: "artifact",
        id: "artifact-artifact-1",
        artifactId: "artifact-1",
        artifactType: "draft_diff",
        status: "proposed",
        title: "Draft proposal",
        payload: { section: "Intro" },
      },
    ]);
  });

  it("drops the reserved assistant placeholder for a given message id without touching real content rows", () => {
    const filtered = stripReservedAssistantTimelineItems([
      {
        type: "assistant_message",
        id: "assistant-1",
        content: "",
        createdAt: "2026-03-01T10:00:00.000Z",
        deliveryState: "reserved",
      },
      {
        type: "assistant_message",
        id: "assistant-1",
        content: "Finished answer",
        createdAt: "2026-03-01T10:00:01.000Z",
      },
      {
        type: "checkpoint",
        id: "checkpoint-1",
        label: "Recovered from checkpoint",
        createdAt: "2026-03-01T10:00:02.000Z",
      },
    ], "assistant-1");

    expect(filtered).toEqual([
      {
        type: "assistant_message",
        id: "assistant-1",
        content: "Finished answer",
        createdAt: "2026-03-01T10:00:01.000Z",
      },
      {
        type: "checkpoint",
        id: "checkpoint-1",
        label: "Recovered from checkpoint",
        createdAt: "2026-03-01T10:00:02.000Z",
      },
    ]);
  });

  it("settles a stopped turn without losing completed work or the user prompt", () => {
    const stoppedAt = "2026-03-01T10:00:03.000Z";
    const timeline = markTimelineStoppedByUser([
      {
        type: "user_message",
        id: "user-1",
        content: "Search PubMed",
        createdAt: "2026-03-01T10:00:00.000Z",
      },
      {
        type: "tool_activity",
        id: "tool-done",
        callId: "call-done",
        toolName: "search_pubmed",
        status: "done",
        startedAt: "2026-03-01T10:00:00.100Z",
        updatedAt: "2026-03-01T10:00:01.000Z",
        completedAt: "2026-03-01T10:00:01.000Z",
        createdAt: "2026-03-01T10:00:00.100Z",
      },
      {
        type: "tool_activity",
        id: "tool-running",
        callId: "call-running",
        toolName: "search_openalex",
        status: "running",
        startedAt: "2026-03-01T10:00:01.100Z",
        updatedAt: "2026-03-01T10:00:01.100Z",
        createdAt: "2026-03-01T10:00:01.100Z",
      },
      {
        type: "progress",
        id: "progress-1",
        message: "Searching",
      },
      {
        type: "assistant_message",
        id: "assistant-reserved",
        content: "",
        deliveryState: "reserved",
        createdAt: "2026-03-01T10:00:02.000Z",
      },
    ], {
      createdAt: stoppedAt,
      runId: "run-1",
    });

    expect(timeline).toMatchObject([
      { type: "user_message", id: "user-1" },
      { type: "tool_activity", id: "tool-done", status: "done" },
      {
        type: "tool_activity",
        id: "tool-running",
        status: "interrupted",
        summary: "Stopped by you before this step finished.",
        completedAt: stoppedAt,
      },
      {
        type: "error",
        id: "run-cancelled-run-1",
        message: "Stopped by you. Completed work is preserved.",
        retryable: true,
        errorMeta: {
          kind: "user_cancelled",
          recoveryRecommendation: "retry",
        },
      },
    ]);
    expect(timeline.some((item) => item.type === "progress")).toBe(false);
    expect(timeline.some((item) => item.type === "assistant_message")).toBe(false);
  });
});
