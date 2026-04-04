// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectConversationProvider, useProjectConversation } from "../ProjectConversationContext";

const {
    mockUploadChatAttachmentAction,
    mockExtractTextFromExistingFileAction,
} = vi.hoisted(() => ({
    mockUploadChatAttachmentAction: vi.fn(),
    mockExtractTextFromExistingFileAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
    }),
}));

vi.mock("@/lib/project-conversation-storage", () => ({
    loadProjectConversationState: () => ({
        messages: [],
        panel: { collapsed: false, width: 400 },
    }),
    saveProjectConversationState: vi.fn(),
    createDefaultProjectConversationState: () => ({
        messages: [],
        panel: { collapsed: false, width: 400 },
    }),
}));

vi.mock("@/app/actions/files", () => ({
    uploadChatAttachmentAction: (...args: unknown[]) => mockUploadChatAttachmentAction(...args),
    extractTextFromExistingFileAction: (...args: unknown[]) => mockExtractTextFromExistingFileAction(...args),
}));

vi.mock("@/app/actions/agent", () => ({
    getAutonomyConfigAction: vi.fn(async () => ({
        success: true,
        config: { preset: "assisted", toolOverrides: {} },
    })),
    updateAutonomyAction: vi.fn(),
}));

vi.mock("@/hooks/useProjectConversationManager", () => ({
    useProjectConversationManager: () => ({
        conversations: [],
        currentConversationId: null,
        isLoadingConversations: false,
        showConversationList: false,
        toggleConversationList: vi.fn(),
        selectConversation: vi.fn(),
        newConversation: vi.fn(),
        renameConversation: vi.fn(),
        deleteConversation: vi.fn(),
        branchConversation: vi.fn(),
        loadConversations: vi.fn(),
        setStudyFilter: vi.fn(),
        setCurrentConversationId: vi.fn(),
        setConversations: vi.fn(),
        markConversationActivity: vi.fn(),
        summarizeAndRefresh: vi.fn(),
        isSummarizing: false,
        isConversationLoading: false,
        hasMore: false,
        isLoadingOlder: false,
        loadOlderMessages: vi.fn(),
        currentConversationIdRef: { current: null },
        studyFilterRef: { current: null },
    }),
}));

vi.mock("@/hooks/useProjectConversationStreamActions", () => ({
    useProjectConversationStreamActions: () => ({
        sendMessage: vi.fn(),
        cancelStream: vi.fn(),
        handleReviewArtifact: vi.fn(),
        handleUndoArtifact: vi.fn(),
        approveArtifactsBatch: vi.fn(),
        executePlan: vi.fn(),
        reconnectRun: vi.fn(),
    }),
}));

vi.mock("@/lib/ai/reasoning-visibility", () => ({
    getReasoningModePreference: () => "full",
    setReasoningModePreference: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
    return (
        <ProjectConversationProvider projectId="project-1">
            {children}
        </ProjectConversationProvider>
    );
}

describe("ProjectConversation attachment ownership", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("stores a structured ready attachment result from a new upload", async () => {
        mockUploadChatAttachmentAction.mockResolvedValue({
            success: true,
            data: {
                fileAssetId: "file-1",
                filename: "study.pdf",
                size: 123,
                mimeType: "application/pdf",
                extraction: {
                    status: "ready",
                    text: "Extracted study text",
                },
                publicUrl: "https://example.test/study.pdf",
            },
        });

        const { result } = renderHook(() => useProjectConversation(), { wrapper });
        const file = new File(["pdf"], "study.pdf", { type: "application/pdf" });

        await act(async () => {
            await result.current.attachFile(file);
        });

        expect(mockUploadChatAttachmentAction).toHaveBeenCalledWith("project-1", expect.any(FormData));
        const formData = mockUploadChatAttachmentAction.mock.calls[0]?.[1] as FormData;
        expect(formData.get("file")).toBe(file);
        expect(result.current.pendingAttachment).toEqual({
            fileAssetId: "file-1",
            filename: "study.pdf",
            size: 123,
            mimeType: "application/pdf",
            extraction: {
                status: "ready",
                text: "Extracted study text",
            },
            isExisting: false,
        });
        expect(result.current.isAttaching).toBe(false);
    });

    it("stores a structured extraction failure from an existing file without fabricating success", async () => {
        mockExtractTextFromExistingFileAction.mockResolvedValue({
            success: true,
            data: {
                fileAssetId: "file-2",
                filename: "existing.pdf",
                size: 456,
                mimeType: "application/pdf",
                extraction: {
                    status: "failed",
                    reason: "storage_fetch_failed",
                    message: "LitRev found the PDF, but could not load it for chat. Remove it or try again.",
                },
            },
        });

        const { result } = renderHook(() => useProjectConversation(), { wrapper });

        await act(async () => {
            await result.current.attachExistingFile("file-2");
        });

        expect(mockExtractTextFromExistingFileAction).toHaveBeenCalledWith("project-1", "file-2");
        expect(result.current.pendingAttachment).toEqual({
            fileAssetId: "file-2",
            filename: "existing.pdf",
            size: 456,
            mimeType: "application/pdf",
            extraction: {
                status: "failed",
                reason: "storage_fetch_failed",
                message: "LitRev found the PDF, but could not load it for chat. Remove it or try again.",
            },
            isExisting: true,
        });
        expect(result.current.isAttaching).toBe(false);
    });

    it("leaves attachment state empty when a new upload action fails", async () => {
        mockUploadChatAttachmentAction.mockResolvedValue({
            success: false,
            error: "Upload failed.",
        });

        const { result } = renderHook(() => useProjectConversation(), { wrapper });

        await act(async () => {
            await result.current.attachFile(new File(["pdf"], "broken.pdf", { type: "application/pdf" }));
        });

        expect(result.current.pendingAttachment).toBeNull();
        expect(result.current.isAttaching).toBe(false);
    });

    it("leaves attachment state empty when attaching an existing file fails", async () => {
        mockExtractTextFromExistingFileAction.mockResolvedValue({
            success: false,
            error: "Extraction failed.",
        });

        const { result } = renderHook(() => useProjectConversation(), { wrapper });

        await act(async () => {
            await result.current.attachExistingFile("file-404");
        });

        expect(result.current.pendingAttachment).toBeNull();
        expect(result.current.isAttaching).toBe(false);
    });
});
