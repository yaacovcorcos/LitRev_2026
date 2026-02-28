// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Study } from "@/types/ledger";
import type { CriteriaMatchResult } from "@/lib/criteriaMatching";
import { StudyRow } from "../StudyRow";

const { mockPush, mockOpenPopupChat } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockOpenPopupChat: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/contexts/PopupChatContext", () => ({
  usePopupChat: () => ({
    openPopupChat: mockOpenPopupChat,
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
          isExpanded={options?.isExpanded ?? false}
          isSelected={false}
          isSelectMode={options?.isSelectMode ?? false}
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

  it("navigates to study detail when row body is clicked", () => {
    renderRow();

    fireEvent.click(screen.getByText("Example Study"));

    expect(mockPush).toHaveBeenCalledWith("/project/project-1/ledger/study-1");
  });

  it("executes row actions without triggering navigation", () => {
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
    expect(mockPush).not.toHaveBeenCalled();
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
});
