import { describe, expect, it } from "vitest";
import { normalizeAssistantContent } from "@/lib/ai/normalize-assistant-content";

const SAMPLE_SCOPING_REPORT = {
  topic: "Mindfulness for chronic pain",
  searchesRun: [],
  landscape: {
    majorThemes: [],
    evidenceGaps: [],
    methodologicalPatterns: [],
    evidenceDensity: "moderate" as const,
  },
  recommendedQuestions: [],
  nextStep: "Choose a question.",
};

describe("normalizeAssistantContent", () => {
  it("removes known mentioned-studies and scoping hidden blocks from display content", () => {
    const content = [
      "Visible narrative",
      "",
      `<!-- SCOPING_REPORT: ${JSON.stringify(SAMPLE_SCOPING_REPORT)} -->`,
      '<!-- MENTIONED_STUDIES: {"studies":[{"title":"Study A","doi":"10.1000/a"}]} -->',
    ].join("\n");

    const normalized = normalizeAssistantContent(content);

    expect(normalized.displayContent).toBe("Visible narrative");
    expect(normalized.mentionedStudies).toHaveLength(1);
    expect(normalized.scopingReport?.topic).toBe("Mindfulness for chronic pain");
    expect(normalized.hiddenBlocks.map((block) => block.type)).toEqual([
      "mentioned_studies",
      "scoping_report",
    ]);
  });

  it("removes open malformed internal blocks without stripping generic comments", () => {
    const content = [
      "Visible narrative",
      "",
      "<!-- harmless note -->",
      "<!-- MENTIONED_STUDIES: {\"studies\":[{\"title\":\"Study A\",\"doi\":\"10.1000/a\"}]}",
      "<scoping_report>{\"topic\":\"bad-json\"",
    ].join("\n");

    const normalized = normalizeAssistantContent(content);

    expect(normalized.displayContent).toContain("Visible narrative");
    expect(normalized.displayContent).toContain("<!-- harmless note -->");
    expect(normalized.displayContent).not.toContain("MENTIONED_STUDIES");
    expect(normalized.displayContent).not.toContain("<scoping_report>");
  });

  it("keeps unknown hidden-like blocks untouched", () => {
    const content = "Narrative\n\n<!-- CUSTOM_INTERNAL: {\"x\":1} -->";

    const normalized = normalizeAssistantContent(content);

    expect(normalized.displayContent).toContain("<!-- CUSTOM_INTERNAL: {\"x\":1} -->");
    expect(normalized.hiddenBlocks).toHaveLength(0);
  });

  it("supports fenced scoping and mentioned-study payloads", () => {
    const content = [
      "Narrative",
      "",
      "```scoping_report",
      JSON.stringify(SAMPLE_SCOPING_REPORT),
      "```",
      "",
      "```mentioned_studies",
      '{"studies":[{"title":"Study A","doi":"10.1000/a"}]}',
      "```",
    ].join("\n");

    const normalized = normalizeAssistantContent(content);

    expect(normalized.displayContent).toBe("Narrative");
    expect(normalized.scopingReport?.topic).toBe("Mindfulness for chronic pain");
    expect(normalized.mentionedStudies[0]?.doi).toBe("10.1000/a");
  });
});
