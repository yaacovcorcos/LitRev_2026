// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import NotesPage from "../page";

const { mockListNotesAction, mockUseProjectData, mockAddProjectDataChangedListener } = vi.hoisted(() => ({
    mockListNotesAction: vi.fn(),
    mockUseProjectData: vi.fn(),
    mockAddProjectDataChangedListener: vi.fn(() => () => {}),
}));

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "proj_1" }),
}));

vi.mock("@/app/actions/notes", () => ({
    listNotesAction: (...args: unknown[]) => mockListNotesAction(...args),
    createNoteFullAction: vi.fn(),
    getNoteAction: vi.fn(),
    updateNoteAction: vi.fn(),
    deleteNoteAction: vi.fn(),
    searchNotesAction: vi.fn(),
}));

vi.mock("@/hooks/useProjectData", () => ({
    useProjectData: () => mockUseProjectData(),
}));

vi.mock("@/lib/project-data-events", () => ({
    addProjectDataChangedListener: mockAddProjectDataChangedListener,
}));

vi.mock("@/lib/mobile/feature-flags", () => ({
    isMobileNotesV2Enabled: () => false,
}));

vi.mock("@/hooks/useContextCaptureActions", () => ({
    useContextCaptureActions: () => ({
        captureEnabled: false,
        prefillCopilotWithTargets: vi.fn(),
    }),
}));

vi.mock("@/components/project/ProjectPageLayout", () => ({
    ProjectPageLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/project/DemoGuideCard", () => ({
    DemoGuideCard: () => null,
}));

vi.mock("@/components/ConfirmDialog", () => ({
    ConfirmDialog: () => null,
}));

vi.mock("../../draft/DraftEditors", () => ({
    EditorToolbar: () => null,
}));

vi.mock("@tiptap/react", () => ({
    useEditor: () => null,
    EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock("@tiptap/starter-kit", () => ({
    default: {},
}));

vi.mock("@tiptap/extension-underline", () => ({
    default: {},
}));

vi.mock("@tiptap/extension-placeholder", () => ({
    default: { configure: () => ({}) },
}));

describe("NotesPage loading behavior", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("refreshes when preload cache is ready with [] and transitions to empty state", async () => {
        mockUseProjectData.mockReturnValue({
            notesList: { state: "ready", data: [], error: null },
        });
        mockListNotesAction.mockResolvedValue({ success: true, data: [] });

        render(<NotesPage />);

        expect(screen.getByText("Loading...")).toBeTruthy();

        await waitFor(() => {
            expect(screen.getByText("No notes yet")).toBeTruthy();
        });

        expect(mockListNotesAction).toHaveBeenCalledTimes(1);
        expect(mockListNotesAction).toHaveBeenCalledWith("proj_1");
        expect(screen.queryByText("Loading...")).toBeNull();
    });

    it("clears loading and stays stable when list fetch throws", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        mockUseProjectData.mockReturnValue({
            notesList: { state: "idle", data: null, error: null },
        });
        mockListNotesAction.mockRejectedValue(new Error("network fail"));

        render(<NotesPage />);

        await waitFor(() => {
            expect(screen.getByText("No notes yet")).toBeTruthy();
        });

        expect(mockListNotesAction).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith("[notes] failed to load notes", expect.any(Error));
        expect(screen.queryByText("Loading...")).toBeNull();
        consoleErrorSpy.mockRestore();
    });
});
