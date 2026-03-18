import { describe, expect, it } from "vitest";
import { buildTimelineMarkdown, buildTimelinePrintHtml } from "@/app/ai/ai-export";
import type { TimelineItem } from "@/types/timeline";

describe("ai-export", () => {
  it("removes hidden assistant metadata from markdown exports", () => {
    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-03-18T00:00:00.000Z",
        content: 'Visible narrative\n\n<!-- MENTIONED_STUDIES: {"studies":[{"title":"Study","doi":"10.1000/x"}]} -->',
      },
    ];

    const markdown = buildTimelineMarkdown(items, "Conversation");

    expect(markdown).toContain("Visible narrative");
    expect(markdown).not.toContain("MENTIONED_STUDIES");
  });

  it("removes hidden assistant metadata from print html exports", () => {
    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-03-18T00:00:00.000Z",
        content: 'Visible narrative\n\n<!-- SCOPING_REPORT: {"topic":"x","searchesRun":[],"landscape":{"majorThemes":[],"evidenceGaps":[],"methodologicalPatterns":[],"evidenceDensity":"moderate"},"recommendedQuestions":[],"nextStep":"x"} -->',
      },
    ];

    const html = buildTimelinePrintHtml(items, "Conversation");

    expect(html).toContain("Visible narrative");
    expect(html).not.toContain("SCOPING_REPORT");
  });
});
