// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";
import DraftPage from "../page";

const {
  mockLoadDraftState,
  mockWarmDomain,
  mockPush,
  mockReplace,
  mockSearchParams,
  mockEditor,
  mockGetProjectById,
  mockGetStudiesByProject,
  mockSetCopilotPanelWidth,
  mockOpenPopupChat,
  mockOpenPopupForTarget,
  mockRunAction,
} = vi.hoisted(() => ({
  mockLoadDraftState: vi.fn(),
  mockWarmDomain: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockSearchParams: new URLSearchParams(),
  mockGetProjectById: vi.fn(() => ({ id: "proj-1", name: "Alpha Draft" })),
  mockGetStudiesByProject: vi.fn(() => [
    { id: "study-1", title: "Trial A" },
    { id: "study-2", title: "Trial B" },
  ]),
  mockSetCopilotPanelWidth: vi.fn(),
  mockOpenPopupChat: vi.fn(),
  mockOpenPopupForTarget: vi.fn(),
  mockRunAction: vi.fn(),
  mockEditor: {
    chain: () => ({
      focus: () => ({
        run: vi.fn(),
        insertContent: () => ({
          insertContent: () => ({ run: vi.fn() }),
          run: vi.fn(),
        }),
      }),
    }),
    commands: {
      setContent: vi.fn(),
    },
    setEditable: vi.fn(),
    getAttributes: vi.fn(() => ({})),
    getJSON: () => ({ type: "doc", content: [{ type: "paragraph" }] }),
    getText: () => "",
    state: {
      selection: { empty: true, from: 0, to: 0 },
      doc: { textBetween: () => "" },
    },
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useParams: () => ({ id: "proj-1" }),
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
    useSearchParams: () => new URLSearchParams(mockSearchParams.toString()),
  };
});

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="export-modal" />,
}));

vi.mock("@/components/BaseBackButton", () => ({
  BaseBackButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

vi.mock("@/components/project/ProjectPageLayout", () => ({
  ProjectPageLayout: ({ children }: { children: ReactNode }) => <div data-testid="project-page-layout">{children}</div>,
}));

vi.mock("@/components/ProjectCopilot", () => ({
  ProjectCopilot: () => <div data-testid="project-copilot" />,
}));

vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  EmptyStateSkeleton: () => <div>Loading shell</div>,
}));

vi.mock("@/components/project/DemoGuideCard", () => ({
  DemoGuideCard: () => null,
}));

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: () => ({
    getProjectById: mockGetProjectById,
    isLoadingProjects: false,
    projectsError: null,
  }),
}));

vi.mock("@/contexts/LedgerContext", () => ({
  useLedger: () => ({
    getStudiesByProject: mockGetStudiesByProject,
  }),
}));

vi.mock("@/contexts/ProjectCopilotContext", () => ({
  useProjectCopilot: () => ({
    isCollapsed: false,
    panelWidth: 360,
    setPanelWidth: mockSetCopilotPanelWidth,
  }),
}));

vi.mock("@/contexts/ProjectShellContext", () => ({
  useProjectShell: () => ({
    isEmbeddedInProjectShell: false,
  }),
}));

vi.mock("@/contexts/PopupChatContext", () => ({
  usePopupChat: () => ({
    openPopupChat: mockOpenPopupChat,
  }),
}));

vi.mock("@/hooks/useContextCaptureActions", () => ({
  useContextCaptureActions: () => ({
    captureEnabled: false,
    openPopupForTarget: mockOpenPopupForTarget,
    runAction: mockRunAction,
  }),
}));

vi.mock("@/lib/context-capture/actions", () => ({
  getContextCaptureAction: (id: string) => ({
    id,
    icon: "bolt",
    label: id,
    defaultPrompt: `${id} prompt`,
  }),
}));

vi.mock("@/lib/context-capture/targets", () => ({
  buildDraftSelectionTarget: () => ({ type: "draft-selection" }),
}));

vi.mock("@/hooks/useProjectData", () => ({
  useProjectData: () => ({
    draft: { state: "idle" },
    warmDomain: mockWarmDomain,
  }),
}));

vi.mock("@/app/actions/drafts", () => ({
  saveDraftAction: vi.fn(async (_projectId: string, state: unknown) => ({ success: true, data: state })),
}));

vi.mock("@/app/actions/files", () => ({
  listProjectFilesAction: vi.fn(async () => ({ success: true, data: [] })),
  deleteFileAssetAction: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/app/actions/draft-exports", () => ({
  generateDraftExportAction: vi.fn(async () => ({
    success: true,
    data: {
      id: "file-1",
      kind: "export",
      format: "docx",
      filename: "Alpha-Draft-v1.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1024,
      publicUrl: "https://example.com/file-1.docx",
      downloadUrl: "https://example.com/file-1.docx",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })),
}));

vi.mock("@/lib/mobile/feature-flags", () => ({
  isMobileDraftV2Enabled: () => false,
}));

vi.mock("@/lib/context-capture/feature-flags", () => ({
  isContextToolbarV1Enabled: () => false,
}));

vi.mock("../AddEvidenceModal", () => ({
  AddEvidenceModal: () => <div data-testid="add-evidence-modal" />,
}));

vi.mock("../DraftEditors", () => ({
  Citation: {},
  ParagraphDirection: {},
  EditorToolbar: () => <div data-testid="editor-toolbar" />,
  FullSectionEditor: ({ sectionId }: { sectionId: string }) => (
    <div data-testid="section-editor" data-section-id={sectionId} />
  ),
}));

vi.mock("@tiptap/react", () => {
  return {
    Editor: class {},
    EditorContent: () => <div data-testid="editor-content" />,
    useEditor: () => mockEditor,
  };
});

vi.mock("@/lib/draftStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/draftStorage")>();
  return {
    ...actual,
    loadDraftState: (...args: Parameters<typeof actual.loadDraftState>) => mockLoadDraftState(...args),
    saveDraftState: vi.fn(),
  };
});

function textDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function setSearchParams(query: string) {
  mockSearchParams.forEach((_, key) => {
    mockSearchParams.delete(key);
  });
  const next = new URLSearchParams(query);
  next.forEach((value, key) => {
    mockSearchParams.set(key, value);
  });
}

function createDraftState(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    mode: "section",
    activeSection: "abstract",
    sectionOrder: ["abstract", "introduction", "methods", "results", "discussion", "conclusion", "references"],
    customSections: {},
    formattingBySection: {
      [UNSECTIONED_DRAFT_ID]: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      abstract: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      introduction: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      methods: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      results: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      discussion: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      conclusion: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      references: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
    },
    panels: {
      ledgerWidth: 320,
      copilotWidth: 360,
      ledgerCollapsed: false,
      copilotCollapsed: false,
    },
    contentBySection: {
      [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
      abstract: { type: "doc", content: [{ type: "paragraph" }] },
      introduction: { type: "doc", content: [{ type: "paragraph" }] },
      methods: { type: "doc", content: [{ type: "paragraph" }] },
      results: { type: "doc", content: [{ type: "paragraph" }] },
      discussion: { type: "doc", content: [{ type: "paragraph" }] },
      conclusion: { type: "doc", content: [{ type: "paragraph" }] },
      references: { type: "doc", content: [{ type: "paragraph" }] },
    },
    ledgerBySection: {
      [UNSECTIONED_DRAFT_ID]: [],
      abstract: ["study-1"],
      introduction: [],
      methods: [],
      results: [],
      discussion: [],
      conclusion: [],
      references: [],
    },
    copilotBySection: {
      [UNSECTIONED_DRAFT_ID]: [],
      abstract: [],
      introduction: [],
      methods: [],
      results: [],
      discussion: [],
      conclusion: [],
      references: [],
    },
    manuscript: {
      version: 2,
      root: { type: "doc", content: [] },
      sections: [],
      references: { orderedStudyIds: [] },
    },
    ...overrides,
  };
}

describe("Draft page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSearchParams("");
    mockLoadDraftState.mockReturnValue(createDraftState());
  });

  it("renders the old section-first shell with the inline evidence ledger and section editor", async () => {
    render(<DraftPage />);

    expect(await screen.findByText("Evidence Ledger")).toBeTruthy();
    expect(screen.getByText("Alpha Draft")).toBeTruthy();
    expect(screen.getAllByText("Abstract").length).toBeGreaterThan(0);
    expect(screen.getByText("Trial A")).toBeTruthy();
    expect(screen.getByTestId("editor-toolbar")).toBeTruthy();
    expect(screen.getByTestId("editor-content")).toBeTruthy();
    expect(screen.getByTestId("project-copilot")).toBeTruthy();
  });

  it("renders the references section as read-only in section mode", async () => {
    mockLoadDraftState.mockReturnValue(
      createDraftState({
        activeSection: "references",
        ledgerBySection: {
          abstract: [],
          introduction: [],
          methods: [],
          results: [],
          discussion: [],
          conclusion: [],
          references: [],
        },
      }),
    );

    render(<DraftPage />);

    expect(await screen.findByText("References are auto-generated from inline citations.")).toBeTruthy();
    expect(screen.queryByTestId("editor-content")).toBeNull();
  });

  it("shows the old full-draft empty state when no sections have content", async () => {
    mockLoadDraftState.mockReturnValue(
      createDraftState({
        mode: "full",
      }),
    );

    render(<DraftPage />);

    expect(await screen.findByText("Nothing written yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start drafting" })).toBeTruthy();
  });

  it("forces zero-section drafts into full draft and disables section mode", async () => {
    mockLoadDraftState.mockReturnValue(
      createDraftState({
        mode: "section",
        activeSection: "abstract",
        sectionOrder: [],
      }),
    );

    render(<DraftPage />);

    expect(await screen.findByText("Nothing written yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Section" }).getAttribute("disabled")).not.toBeNull();
    expect(screen.getAllByText("Whole draft").length).toBeGreaterThan(0);
  });

  it("lets explicit query route state beat persisted mode and section", async () => {
    setSearchParams("mode=full&section=discussion");
    mockLoadDraftState.mockReturnValue(
      createDraftState({
        mode: "section",
        activeSection: "abstract",
        contentBySection: {
          [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
          abstract: textDoc("Abstract content"),
          introduction: textDoc("Intro content"),
          methods: textDoc("Methods content"),
          results: textDoc("Results content"),
          discussion: textDoc("Discussion content"),
          conclusion: { type: "doc", content: [{ type: "paragraph" }] },
          references: { type: "doc", content: [{ type: "paragraph" }] },
        },
      }),
    );

    render(<DraftPage />);

    expect(await screen.findByText(/Full manuscript view/)).toBeTruthy();
    const editors = await screen.findAllByTestId("section-editor");
    expect(editors.some((editor) => editor.getAttribute("data-section-id") === "discussion")).toBe(true);
  });

  it("normalizes invalid query section state through replace without pushing history", async () => {
    setSearchParams("mode=section&section=missing-section");

    render(<DraftPage />);

    await screen.findByText("Alpha Draft");
    expect(mockReplace).toHaveBeenCalledWith("/project/proj-1/draft?mode=section&section=abstract", { scroll: false });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not reload persisted content when query params change after mount", async () => {
    const initialState = createDraftState({
      contentBySection: {
        [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
        abstract: textDoc("Abstract content"),
        introduction: textDoc("Introduction content"),
        methods: { type: "doc", content: [{ type: "paragraph" }] },
        results: { type: "doc", content: [{ type: "paragraph" }] },
        discussion: { type: "doc", content: [{ type: "paragraph" }] },
        conclusion: { type: "doc", content: [{ type: "paragraph" }] },
        references: { type: "doc", content: [{ type: "paragraph" }] },
      },
    });
    mockLoadDraftState.mockReturnValue(initialState);

    const view = render(<DraftPage />);
    await screen.findByText("Alpha Draft");
    expect(mockLoadDraftState).toHaveBeenCalledTimes(1);

    setSearchParams("mode=full&section=introduction");
    view.rerender(<DraftPage />);

    expect(await screen.findByText(/Full manuscript view/)).toBeTruthy();
    expect(mockLoadDraftState).toHaveBeenCalledTimes(1);
  });

  it("renders only contentful sections in full draft", async () => {
    mockLoadDraftState.mockReturnValue(
      createDraftState({
        mode: "full",
        contentBySection: {
          abstract: textDoc("Abstract content"),
          introduction: { type: "doc", content: [{ type: "paragraph" }] },
          methods: { type: "doc", content: [{ type: "paragraph" }] },
          results: { type: "doc", content: [{ type: "paragraph" }] },
          discussion: { type: "doc", content: [{ type: "paragraph" }] },
          conclusion: { type: "doc", content: [{ type: "paragraph" }] },
          references: { type: "doc", content: [{ type: "paragraph" }] },
        },
      }),
    );

    render(<DraftPage />);

    const editors = await screen.findAllByTestId("section-editor");
    expect(editors).toHaveLength(1);
    expect(editors[0]?.getAttribute("data-section-id")).toBe("abstract");
    expect(screen.getByText(/Full manuscript view/)).toBeTruthy();
  });

  it("reopens the evidence ledger after collapsing it", async () => {
    render(<DraftPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Collapse evidence ledger" }));
    expect(screen.getByText("Evidence")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Expand evidence ledger" }));
    expect(await screen.findByText("Evidence Ledger")).toBeTruthy();
  });

  it("uses push for user-initiated draft navigation", async () => {
    render(<DraftPage />);
    await screen.findByText("Alpha Draft");
    mockPush.mockClear();
    mockReplace.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Full Draft" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/project/proj-1/draft?mode=full&section=abstract", { scroll: false });
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
