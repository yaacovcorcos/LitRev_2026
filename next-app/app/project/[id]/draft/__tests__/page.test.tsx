// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DraftPage from "../page";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";

const { mockUseDraftWorkspaceController } = vi.hoisted(() => ({
  mockUseDraftWorkspaceController: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "proj-1" }),
}));

vi.mock("@/components/project/ProjectPageLayout", () => ({
  ProjectPageLayout: ({
    children,
    copilot,
  }: {
    children: ReactNode;
    copilot?: { section?: string };
  }) => (
    <div data-testid="project-page-layout" data-has-copilot={copilot ? "1" : "0"} data-copilot-section={copilot?.section ?? ""}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ isOpen }: { isOpen: boolean }) => <div data-testid="confirm-dialog" data-open={isOpen ? "1" : "0"} />,
}));

vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  EmptyStateSkeleton: () => <div>Loading shell</div>,
}));

vi.mock("../AddEvidenceModal", () => ({
  AddEvidenceModal: () => <div data-testid="add-evidence-modal" />,
}));

vi.mock("@/components/ExportModal", () => ({
  ExportModal: () => <div data-testid="export-modal" />,
}));

vi.mock("../DraftContextRail", () => ({
  EvidencePane: () => <div data-testid="evidence-pane" />,
}));

vi.mock("../StructureRail", () => ({
  SectionsPane: () => <div data-testid="sections-pane" />,
}));

vi.mock("../DraftSidebar", () => ({
  DraftSidebar: ({
    sectionsPane,
    evidencePane,
    collapsed,
  }: {
    sectionsPane: ReactNode;
    evidencePane: ReactNode;
    collapsed: boolean;
  }) => (
    <div data-testid="draft-sidebar" data-collapsed={collapsed ? "1" : "0"}>
      {sectionsPane}
      {evidencePane}
    </div>
  ),
}));

vi.mock("../DraftEditors", () => ({
  EditorToolbar: () => <div data-testid="editor-toolbar" />,
  FullSectionEditor: ({ sectionId, editable }: { sectionId: string; editable?: boolean }) => (
    <div data-testid="section-editor" data-section-id={sectionId} data-editable={editable === false ? "0" : "1"} />
  ),
}));

vi.mock("../DraftToolbar", () => ({
  DraftTopBar: ({ projectName, mode }: { projectName: string; mode: "section" | "full" }) => (
    <div data-testid="draft-top-bar">
      <div>{projectName}</div>
      <div>{mode === "section" ? "Section" : "Full Draft"}</div>
    </div>
  ),
  DraftFormattingPanel: () => <div data-testid="formatting-panel" />,
}));

vi.mock("../useDraftWorkspaceController", () => ({
  useDraftWorkspaceController: (...args: unknown[]) => mockUseDraftWorkspaceController(...args),
}));

function createController(overrides: Partial<ReturnType<typeof mockUseDraftWorkspaceController>> = {}) {
  return {
    isLoadingProjects: false,
    projectsError: null,
    project: { id: "proj-1", name: "Alpha Draft" },
    isEmbeddedInProjectShell: false,
    projectCopilot: null,
    draft: {
      mode: "full" as const,
      activeSection: null,
      contentBySection: {
        [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [] },
        abstract: { type: "doc", content: [] },
      },
    },
    saveStatus: "saved" as const,
    orderedSections: [],
    availableSections: [],
    hasEditableSections: false,
    activeSectionLabel: "Draft",
    currentTargetId: UNSECTIONED_DRAFT_ID,
    currentTargetLabel: "Whole draft",
    isReferencesTarget: false,
    activeEditor: null,
    paragraphDir: "ltr" as const,
    formatVarsById: {
      [UNSECTIONED_DRAFT_ID]: {},
    },
    activeFormat: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
    activeFontFamily: "Georgia",
    shouldRenderWholeDraft: true,
    wholeDraftMeta: { id: UNSECTIONED_DRAFT_ID, label: "Whole draft", placeholder: "Start writing..." },
    sidebarSections: [],
    sidebarView: "sections" as const,
    setSidebarView: vi.fn(),
    isSidebarCollapsed: false,
    toggleSidebar: vi.fn(),
    isPhoneWorkspace: false,
    isCompactWorkspace: false,
    draggingKey: null,
    dragOverKey: null,
    dragOverPosition: null,
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleDrop: vi.fn(),
    handleDragEnd: vi.fn(),
    handleSelectSectionKeyDown: vi.fn(),
    handleToggleMode: vi.fn(),
    handleAddSection: vi.fn(),
    handleAddCustomSection: vi.fn(),
    selectSection: vi.fn(),
    selectSectionHeading: vi.fn(),
    handleMoveSection: vi.fn(),
    requestRemoveSection: vi.fn(),
    sectionToRemove: null,
    confirmRemoveSection: vi.fn(),
    cancelRemoveSection: vi.fn(),
    pendingSectionRequest: null,
    confirmPendingMove: vi.fn(),
    confirmPendingKeep: vi.fn(),
    cancelPendingSectionRequest: vi.fn(),
    isAddSectionOpen: false,
    setAddSectionOpen: vi.fn(),
    customSectionName: "",
    setCustomSectionName: vi.fn(),
    sectionTabRefs: { current: {} },
    addSectionRef: { current: null },
    addSectionInputRef: { current: null },
    formatRef: { current: null },
    isFormatOpen: false,
    setFormatOpen: vi.fn(),
    updateSectionFormat: vi.fn(),
    registerEditor: vi.fn(),
    handleSectionFocus: vi.fn(),
    handleSectionSelectionChange: vi.fn(),
    updateSectionContent: vi.fn(),
    usedEvidence: [],
    usedEvidenceIds: [],
    studies: [],
    isAddEvidenceOpen: false,
    setAddEvidenceOpen: vi.fn(),
    handleAddEvidence: vi.fn(),
    handleRemoveEvidence: vi.fn(),
    insertCitation: vi.fn(),
    studyLabel: vi.fn((study: { title: string }) => study.title),
    handleAskAi: vi.fn(),
    insertCopilotText: vi.fn(),
    copilotEmptyState: {
      icon: "tips_and_updates",
      title: "Draft faster",
      description: "Ask for an outline.",
      suggestions: [],
    },
    showResultsGuide: false,
    citationIssues: [],
    hasDraftContent: false,
    isExportModalOpen: false,
    setExportModalOpen: vi.fn(),
    handleExportDocx: vi.fn(),
    exportMode: "warn" as const,
    setExportMode: vi.fn(),
    blockingCitationIssuesCount: 0,
    latestExport: null,
    exportHistory: [],
    handleDeleteExport: vi.fn(),
    ...overrides,
  };
}

describe("Draft page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDraftWorkspaceController.mockReturnValue(createController());
  });

  it("renders the restored section-first shell with a persistent sidebar", () => {
    render(<DraftPage />);

    expect(screen.getByTestId("draft-top-bar")).toBeTruthy();
    expect(screen.getByTestId("draft-sidebar")).toBeTruthy();
    expect(screen.getByTestId("editor-toolbar")).toBeTruthy();
    expect(screen.getByTestId("section-editor").getAttribute("data-section-id")).toBe(UNSECTIONED_DRAFT_ID);
    expect(screen.getByTestId("project-page-layout").getAttribute("data-has-copilot")).toBe("1");
  });

  it("renders section mode with a read-only references section editor", () => {
    mockUseDraftWorkspaceController.mockReturnValue(
      createController({
        draft: {
          mode: "section",
          activeSection: "references",
          contentBySection: {
            [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [] },
            references: { type: "doc", content: [] },
          },
        },
        orderedSections: [{ id: "references", label: "References" }],
        hasEditableSections: true,
        activeSectionLabel: "References",
        currentTargetId: "references",
        currentTargetLabel: "References",
        isReferencesTarget: true,
        shouldRenderWholeDraft: false,
      }),
    );

    render(<DraftPage />);

    expect(screen.getByText("Section")).toBeTruthy();
    expect(screen.getByTestId("section-editor").getAttribute("data-section-id")).toBe("references");
    expect(screen.getByTestId("section-editor").getAttribute("data-editable")).toBe("0");
  });
});
