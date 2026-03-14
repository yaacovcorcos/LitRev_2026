// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DraftPage from "../page";

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

vi.mock("@/components/project/DemoGuideCard", () => ({
  DemoGuideCard: ({ text }: { text: string }) => <div>{text}</div>,
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
  OutlinePane: () => <div data-testid="outline-pane" />,
}));

vi.mock("../DraftUtilityDock", () => ({
  DraftUtilityDock: () => <div data-testid="utility-dock" />,
}));

vi.mock("../DraftUtilityDrawer", () => ({
  DraftUtilityDrawer: ({ children }: { children: ReactNode }) => <div data-testid="utility-drawer">{children}</div>,
}));

vi.mock("../ManuscriptCanvas", () => ({
  ManuscriptCanvas: () => <div data-testid="manuscript-canvas" />,
}));

vi.mock("../DraftEditors", () => ({
  EditorToolbar: () => <div data-testid="editor-toolbar" />,
}));

vi.mock("../DraftToolbar", () => ({
  DraftWorkspaceHeader: ({ projectName }: { projectName: string }) => (
    <div>
      <div>{projectName}</div>
      <div>Draft</div>
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
    isMobileDraftV2Enabled: false,
    captureEnabled: false,
    contextToolbarEnabled: false,
    showDesktopContextToolbar: false,
    isReferencesSection: false,
    isEmbeddedInProjectShell: false,
    hasDraftContent: true,
    saveStatus: "saved" as const,
    isCompactWorkspace: false,
    isPhoneWorkspace: false,
    utilityPaneMode: "closed" as const,
    isUtilityPaneOpen: false,
    toggleUtilityPane: vi.fn(),
    closeUtilityPane: vi.fn(),
    showResultsGuide: false,
    outlineView: [],
    draft: {
      activeSection: "abstract",
      manuscript: { doc: { type: "doc", content: [] } },
    },
    collapsedSectionIds: new Set<string>(),
    availableSections: [],
    customSectionName: "",
    draggingSectionId: null,
    dragOverSectionId: null,
    dragOverPosition: null,
    statusLabelByKey: { empty: "Empty", drafting: "Drafting", issues: "Issues", generated: "Generated" },
    setCustomSectionName: vi.fn(),
    handleAddCustomSection: vi.fn(),
    addOptionalSection: vi.fn(),
    focusSection: vi.fn(),
    focusHeading: vi.fn(),
    toggleSectionCollapsed: vi.fn(),
    removeSection: vi.fn(),
    handleSelectSectionKeyDown: vi.fn(),
    handleSectionDragStart: vi.fn(),
    handleSectionDragOver: vi.fn(),
    handleSectionDrop: vi.fn(),
    handleSectionDragEnd: vi.fn(),
    activeSectionLabel: "Abstract",
    usedEvidence: [],
    setAddEvidenceOpen: vi.fn(),
    insertCitation: vi.fn(),
    handleRemoveEvidence: vi.fn(),
    studyLabel: vi.fn((study: { title: string }) => study.title),
    editor: null,
    paragraphDir: "ltr" as const,
    handleAskAi: vi.fn(),
    sendToCopilotAction: { icon: "send", label: "Send", defaultPrompt: "Use this" },
    rewriteSelectionAction: { icon: "edit", label: "Rewrite", defaultPrompt: "Rewrite this" },
    checkClaimSupportAction: { icon: "fact_check", label: "Check", defaultPrompt: "Check this" },
    canRunDraftContextActions: false,
    handleDraftContextAction: vi.fn(),
    isFormatOpen: false,
    setFormatOpen: vi.fn(),
    formatRef: { current: null },
    activeFormat: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
    activeFontFamily: "Georgia",
    updateSectionFormat: vi.fn(),
    citationIssues: [],
    formatVarsById: {},
    selectionState: { activeBlockId: null },
    activeBlockEntry: null,
    handleEditorReady: vi.fn(),
    handleManuscriptChange: vi.fn(),
    handleEditorMapChange: vi.fn(),
    handleSelectionUpdate: vi.fn(),
    syncFormattingFromEditor: vi.fn(),
    moveSelectedBlock: vi.fn(),
    isAddEvidenceOpen: false,
    studies: [],
    usedEvidenceIds: [],
    handleAddEvidence: vi.fn(),
    isExportModalOpen: false,
    setExportModalOpen: vi.fn(),
    handleExportDocx: vi.fn(),
    exportMode: "warn" as const,
    setExportMode: vi.fn(),
    exportCitationIssues: [],
    blockingCitationIssuesCount: 0,
    latestExport: null,
    exportHistory: [],
    handleDeleteExport: vi.fn(),
    copilotEmptyState: {
      icon: "tips_and_updates",
      title: "Draft faster",
      description: "Ask for an outline.",
      suggestions: [],
    },
    insertCopilotText: vi.fn(),
    ...overrides,
  };
}

describe("Draft page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDraftWorkspaceController.mockReturnValue(createController());
  });

  it("renders the continuous manuscript workspace shell", () => {
    render(<DraftPage />);

    expect(screen.getByText("Alpha Draft")).toBeTruthy();
    expect(screen.getByTestId("utility-dock")).toBeTruthy();
    expect(screen.getByTestId("manuscript-canvas")).toBeTruthy();
    expect(screen.queryByTestId("utility-drawer")).toBeNull();
    expect(screen.queryByText("Full Draft")).toBeNull();
    expect(screen.queryByText("Section")).toBeNull();
  });

  it("opens the shared utility drawer and suppresses standalone copilot when embedded", () => {
    mockUseDraftWorkspaceController.mockReturnValue(
      createController({
        utilityPaneMode: "outline",
        isUtilityPaneOpen: true,
        isEmbeddedInProjectShell: true,
      }),
    );

    render(<DraftPage />);

    expect(screen.getByTestId("utility-drawer")).toBeTruthy();
    expect(screen.getByTestId("outline-pane")).toBeTruthy();
    expect(screen.getByTestId("project-page-layout").getAttribute("data-has-copilot")).toBe("0");
  });
});
