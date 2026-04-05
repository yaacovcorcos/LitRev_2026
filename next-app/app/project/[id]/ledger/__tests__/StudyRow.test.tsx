// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Study } from "@/types/ledger";
import type { CriteriaMatchResult } from "@/lib/criteria-matching";
import { StudyRow } from "../StudyRow";

const { mockOpenPopupChat } = vi.hoisted(() => ({
  mockOpenPopupChat: vi.fn(),
}));

vi.mock("@/contexts/PopupChatContext", () => ({
  usePopupChat: () => ({
    openPopupChat: mockOpenPopupChat,
  }),
}));

vi.mock("@/hooks/useContextCaptureActions", () => ({
  useContextCaptureActions: () => ({
    captureEnabled: false,
    openPopupForTarget: vi.fn(),
  }),
}));

function makeStudy(overrides: Partial<Study> = {}): Study {
  return {
    id: "study-1",
    title: "Example Study",
    authors: "Smith, Lee, Patel",
    year: 2024,
    status: "pending",
    quality: "Medium",
    details: {
      abstract: "Sentence one. Sentence two.",
      journal: "JAMA",
      studyType: "RCT",
      ...overrides.details,
    },
    ...overrides,
  };
}

function renderRow(options?: {
  isExpanded?: boolean;
  isSelectMode?: boolean;
  hasProtocolCriteria?: boolean;
  criteriaMatch?: CriteriaMatchResult;
}) {
  const study = makeStudy();
  const handlers = {
    onToggleExpand: vi.fn(),
    onToggleSelect: vi.fn(),
    onOpenFiles: vi.fn(),
    onDeleteStudy: vi.fn(),
    onTriage: vi.fn(),
  };

  render(
    <table>
      <tbody>
        <StudyRow
          study={study}
          projectId="project-1"
          previewHref="/project/project-1/ledger?study=study-1"
          detailHref="/project/project-1/ledger/study-1?filter=all"
          isExpanded={options?.isExpanded ?? false}
          isSelected={false}
          isSelectMode={options?.isSelectMode ?? false}
          isPreviewActive={false}
          hasProtocolCriteria={options?.hasProtocolCriteria ?? false}
          criteriaMatch={options?.criteriaMatch}
          onToggleExpand={handlers.onToggleExpand}
          onToggleSelect={handlers.onToggleSelect}
          onOpenFiles={handlers.onOpenFiles}
          onDeleteStudy={handlers.onDeleteStudy}
          onTriage={handlers.onTriage}
        />
      </tbody>
    </table>,
  );

  return { study, ...handlers };
}

describe("StudyRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders preview and full-study links with distinct targets", () => {
    renderRow();

    expect(
      screen.getByRole("link", { name: "Example Study" }).getAttribute("href"),
    ).toBe("/project/project-1/ledger?study=study-1");
    expect(
      screen
        .getByRole("link", { name: "Open full study page for Example Study" })
        .getAttribute("href"),
    ).toBe("/project/project-1/ledger/study-1?filter=all");
  });

  it("executes row actions without interfering with links", () => {
    const { study, onToggleExpand, onOpenFiles, onDeleteStudy } = renderRow();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(
      screen.getByRole("button", { name: `Manage files for ${study.title}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Delete ${study.title}` }),
    );

    expect(onToggleExpand).toHaveBeenCalledWith("study-1");
    expect(onOpenFiles).toHaveBeenCalledWith(study);
    expect(onDeleteStudy).toHaveBeenCalledWith("study-1");
  });

  it("renders expanded actions and sends triage + ask-ai intents", () => {
    const { onTriage } = renderRow({ isExpanded: true });

    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onTriage).toHaveBeenCalledWith("study-1", "keep");

    fireEvent.click(screen.getByRole("button", { name: /Ask AI/ }));
    expect(mockOpenPopupChat).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "study",
        studyId: "study-1",
        title: "Example Study",
        authors: "Smith, Lee, Patel",
        abstract: "Sentence one.",
      }),
    );
  });

  it("renders protocol criteria failure indicator with reason tooltip", () => {
    renderRow({
      hasProtocolCriteria: true,
      criteriaMatch: {
        matchesYearRange: false,
        matchesStudyDesign: true,
        eligibilityScore: 50,
        exclusionReasons: ["Published before 2018"],
        meetsAllCriteria: false,
      },
    });

    expect(screen.getByTitle("Published before 2018")).toBeDefined();
  });

  it("shows selection checkbox in select mode", () => {
    const { onToggleSelect } = renderRow({ isSelectMode: true });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Example Study" }),
    );
    expect(onToggleSelect).toHaveBeenCalledWith("study-1");
  });

  it("renders queued processing state from the durable snapshot", () => {
    render(
      <table>
        <tbody>
          <StudyRow
            study={makeStudy({
              processing: {
                byPhase: {
                  quickExtract: {
                    phase: "quick_extract",
                    state: "queued",
                    attemptCount: 0,
                  },
                  deepAnalysis: {
                    phase: "deep_analysis",
                    state: "idle",
                    attemptCount: 0,
                  },
                },
                currentPhase: "quick_extract",
                currentState: "queued",
                nextAction: "wait",
                prerequisitesSatisfied: { deepAnalysis: false },
              },
            })}
            projectId="project-1"
            previewHref="/project/project-1/ledger?study=study-1"
            detailHref="/project/project-1/ledger/study-1?filter=all"
            isExpanded={false}
            isSelected={false}
            isSelectMode={false}
            isPreviewActive={false}
            hasProtocolCriteria={false}
            criteriaMatch={undefined}
            onToggleExpand={vi.fn()}
            onToggleSelect={vi.fn()}
            onOpenFiles={vi.fn()}
            onDeleteStudy={vi.fn()}
            onTriage={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(screen.getByText("Queued")).toBeDefined();
  });
});
