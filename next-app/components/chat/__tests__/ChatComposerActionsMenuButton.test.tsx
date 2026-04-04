// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatComposerActionsMenuButton } from "../ChatComposerActionsMenuButton";

const { listProjectFilesAction } = vi.hoisted(() => ({
    listProjectFilesAction: vi.fn(),
}));

vi.mock("@/app/actions/files", () => ({
    listProjectFilesAction,
}));

describe("ChatComposerActionsMenuButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        });
    });

    it("opens a desktop actions menu with upload, compress, and project PDFs", async () => {
        listProjectFilesAction.mockResolvedValue({
            success: true,
            data: [
                {
                    id: "file-study",
                    filename: "study.pdf",
                    format: "pdf",
                    mimeType: "application/pdf",
                    studyId: "study_1",
                },
                {
                    id: "file-project",
                    filename: "project.pdf",
                    format: "pdf",
                    mimeType: "application/pdf",
                    studyId: null,
                },
            ],
        });

        render(
            <ChatComposerActionsMenuButton
                projectId="proj_1"
                studyId="study_1"
                onAttachFile={vi.fn()}
                onAttachExistingFile={vi.fn()}
                onCompress={vi.fn()}
                canCompress={true}
            />,
        );

        fireEvent.pointerDown(screen.getByRole("button", { name: /more actions/i }));

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /upload pdf/i })).toBeTruthy();
        });

        expect(screen.getByRole("button", { name: /compress history/i })).toBeTruthy();
        expect(screen.getByText("This study")).toBeTruthy();
        expect(screen.getByRole("button", { name: /study.pdf/i })).toBeTruthy();
        expect(screen.getByText("Other studies")).toBeTruthy();
        expect(screen.getByRole("button", { name: /project.pdf/i })).toBeTruthy();
        expect(listProjectFilesAction).toHaveBeenCalledWith("proj_1");
    }, 15_000);
});
