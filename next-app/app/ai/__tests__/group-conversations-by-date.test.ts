import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { groupConversationsByDate, type ChatConversation } from "../group-conversations-by-date";

describe("groupConversationsByDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups conversations into today, yesterday, this week, and older buckets", () => {
    const conversations: ChatConversation[] = [
      {
        id: "today",
        title: "Today",
        createdAt: "2026-04-04T08:00:00.000Z",
        updatedAt: "2026-04-04T09:00:00.000Z",
      },
      {
        id: "yesterday",
        title: "Yesterday",
        createdAt: "2026-04-03T08:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z",
      },
      {
        id: "week",
        title: "This week",
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
      {
        id: "older",
        title: "Older",
        createdAt: "2026-03-20T08:00:00.000Z",
        updatedAt: "2026-03-20T09:00:00.000Z",
      },
    ];

    expect(groupConversationsByDate(conversations)).toEqual([
      { title: "Today", items: [conversations[0]] },
      { title: "Yesterday", items: [conversations[1]] },
      { title: "This Week", items: [conversations[2]] },
      { title: "Older", items: [conversations[3]] },
    ]);
  });

  it("omits empty buckets", () => {
    const conversations: ChatConversation[] = [
      {
        id: "only",
        title: "Today only",
        createdAt: "2026-04-04T08:00:00.000Z",
        updatedAt: "2026-04-04T09:00:00.000Z",
      },
    ];

    expect(groupConversationsByDate(conversations)).toEqual([
      { title: "Today", items: conversations },
    ]);
  });
});
