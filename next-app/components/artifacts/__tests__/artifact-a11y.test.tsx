// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { DraftBlock } from "../DraftBlock";
import { StudyCard } from "../StudyCard";
import { ScopingReportCard } from "../ScopingReportCard";
import type { ScopingReportPayload, StudyProposalPayload } from "@/types/artifacts";

const studyPayload: StudyProposalPayload = {
  title: "Mindfulness and pain outcomes",
  authors: "Doe et al.",
  year: 2024,
  source: "semantic_scholar",
  recommendation: "keep",
  confidence: 0.86,
  abstract: "Randomized trial summary text.",
};

const scopingPayload: ScopingReportPayload = {
  topic: "Mindfulness and chronic pain",
  searchesRun: [
    { database: "pubmed", query: "mindfulness chronic pain", resultCount: 42, angle: "broad" },
  ],
  landscape: {
    majorThemes: ["MBSR"],
    evidenceGaps: ["older adults"],
    methodologicalPatterns: ["RCT-heavy"],
    evidenceDensity: "moderate",
    timeframe: { earliest: 2010, latest: 2025 },
  },
  recommendedQuestions: [
    {
      question: "Does MBSR improve pain interference in older adults?",
      rationale: "Actionable and evidence-backed.",
      feasibility: "high",
      novelty: "medium",
    },
  ],
  nextStep: "Select one question and start protocol drafting.",
};

describe("Artifact accessibility", () => {
  it("StudyCard has no obvious axe violations", async () => {
    const { container } = render(
      <StudyCard payload={studyPayload} onKeep={vi.fn()} onExclude={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("DraftBlock has no obvious axe violations", async () => {
    const { container } = render(
      <DraftBlock
        payload={{
          section: "Introduction",
          content: "This is draft content with **markdown**.",
          citations: [{ studyId: "s1", label: "Smith 2024" }],
          wordCount: 8,
        }}
        onAccept={vi.fn()}
      />,
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("ScopingReportCard has no obvious axe violations", async () => {
    const { container } = render(
      <ScopingReportCard payload={scopingPayload} onActionPrompt={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});
