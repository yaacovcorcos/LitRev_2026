import { describe, expect, it } from "vitest";

import {
  mapDbMessagesToTimeline,
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
});
