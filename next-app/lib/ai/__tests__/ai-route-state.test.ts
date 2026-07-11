import { describe, expect, it } from "vitest";

import { buildAiRouteHref, readAiRouteState } from "@/lib/ai/ai-route-state";

describe("AI route state", () => {
  it("reads trimmed project and conversation identity from the URL", () => {
    expect(readAiRouteState(new URLSearchParams({
      conversation: " conv-1 ",
      project: " project-1 ",
    }))).toEqual({
      conversationId: "conv-1",
      projectId: "project-1",
    });
  });

  it("builds a stable URL and omits empty identity", () => {
    expect(buildAiRouteHref({
      conversationId: "conv / 1",
      projectId: "project-1",
    })).toBe("/ai?project=project-1&conversation=conv+%2F+1");

    expect(buildAiRouteHref({ conversationId: null, projectId: null })).toBe("/ai");
  });
});
