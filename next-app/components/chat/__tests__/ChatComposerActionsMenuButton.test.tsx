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

    it("opens a desktop actions menu with upload, compress, and supported project files", async () => {
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
                {
                    id: "file-image",
                    filename: "figure.webp",
                    format: "webp",
                    mimeType: "image/webp",
                    studyId: null,
                },
                {
                    id: "file-unsupported",
                    filename: "notes.txt",
                    format: "txt",
                    mimeType: "text/plain",
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
            expect(screen.getByRole("button", { name: /upload document or image/i })).toBeTruthy();
        });

        expect(screen.getByRole("button", { name: /compress history/i })).toBeTruthy();
        expect(screen.getByText("This study")).toBeTruthy();
        expect(screen.getByRole("button", { name: /study.pdf/i })).toBeTruthy();
        expect(screen.getByText("Other project files")).toBeTruthy();
        expect(screen.getByRole("button", { name: /project.pdf/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /figure.webp/i })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /notes.txt/i })).toBeNull();
        expect(listProjectFilesAction).toHaveBeenCalledWith("proj_1");
    }, 15_000);

    it("accepts a supported image upload and rejects unsupported extensions", async () => {
        listProjectFilesAction.mockResolvedValue({ success: true, data: [] });
        const onAttachFile = vi.fn();
        render(
            <ChatComposerActionsMenuButton
                projectId="proj_1"
                onAttachFile={onAttachFile}
                onAttachExistingFile={vi.fn()}
            />,
        );

        fireEvent.pointerDown(screen.getByRole("button", { name: /more actions/i }));
        await screen.findByRole("button", { name: /upload document or image/i });
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput.accept).toBe(".pdf,.png,.jpg,.jpeg,.webp");

        const image = new File(["image"], "figure.png", { type: "image/png" });
        fireEvent.change(fileInput, { target: { files: [image] } });
        expect(onAttachFile).toHaveBeenCalledWith(image);

        const textFile = new File(["text"], "notes.txt", { type: "text/plain" });
        fireEvent.change(fileInput, { target: { files: [textFile] } });
        expect(onAttachFile).toHaveBeenCalledTimes(1);
    });
});
