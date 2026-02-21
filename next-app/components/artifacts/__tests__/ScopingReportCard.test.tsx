// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScopingReportCard } from "../ScopingReportCard";
import type { ScopingReportPayload } from "@/types/artifacts";

const payload: ScopingReportPayload = {
  topic: "Mindfulness and chronic pain",
  searchesRun: [
    { database: "pubmed", query: "mindfulness chronic pain", resultCount: 42, angle: "broad" },
  ],
  landscape: {
    majorThemes: ["MBSR"],
    evidenceGaps: ["older than 75"],
    methodologicalPatterns: ["RCT-heavy"],
    evidenceDensity: "moderate",
    timeframe: { earliest: 2010, latest: 2025 },
  },
  recommendedQuestions: [
    {
      question: "Does MBSR improve pain interference in older adults?",
      rationale: "Directly actionable question with reasonable evidence.",
      feasibility: "high",
      novelty: "medium",
    },
  ],
  nextStep: "Pick a question to move into protocol.",
};

describe("ScopingReportCard", () => {
  it("emits action prompts for decision buttons", () => {
    const onActionPrompt = vi.fn();

    render(<ScopingReportCard payload={payload} onActionPrompt={onActionPrompt} />);

    fireEvent.click(screen.getByRole("button", { name: "Use This Question" }));
    fireEvent.click(screen.getByRole("button", { name: "Run Deeper Scan" }));

    expect(onActionPrompt).toHaveBeenCalledTimes(2);
    expect(onActionPrompt.mock.calls[0]?.[0]).toContain("Propose updating my protocol research question");
    expect(onActionPrompt.mock.calls[1]?.[0]).toContain("Run a deeper scan");
  });
});
